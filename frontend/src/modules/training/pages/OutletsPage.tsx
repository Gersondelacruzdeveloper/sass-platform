import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Edit3,
  Search,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import {
  createOutlet,
  getOutlets,
  updateOutlet,
} from "../api/trainingApi";
import api from "../../../api/axios";
import type { Outlet } from "../types/training";

const initialForm = {
  name: "",
  area: "",
  manager: "",
  description: "",
  active: true,
};

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [performanceFilter, setPerformanceFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadOutlets() {
    try {
      setLoading(true);
      const data = await getOutlets();
      setOutlets(data);
    } catch (error) {
      console.error("Error loading outlets:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOutlets();
  }, []);

  const filteredOutlets = useMemo(() => {
    return outlets.filter((outlet) => {
      const text = `
        ${outlet.name}
        ${outlet.area || ""}
        ${outlet.manager || ""}
        ${outlet.description || ""}
      `.toLowerCase();

      const score = Number(outlet.average_score || 0);

      const matchesSearch = text.includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && outlet.active) ||
        (statusFilter === "inactive" && !outlet.active);

      const matchesPerformance =
        performanceFilter === "all" ||
        (performanceFilter === "excellent" && score >= 90) ||
        (performanceFilter === "good" && score >= 80 && score < 90) ||
        (performanceFilter === "attention" && score >= 70 && score < 80) ||
        (performanceFilter === "critical" && score < 70);

      return matchesSearch && matchesStatus && matchesPerformance;
    });
  }, [outlets, search, statusFilter, performanceFilter]);

  const activeOutlets = outlets.filter((item) => item.active).length;
  const totalEmployees = outlets.reduce(
    (total, item) => total + Number(item.employees_count || 0),
    0
  );
  const avgHRScore = getAverage(outlets.map((item) => item.hard_rock_score));
  const avgOutletScore = getAverage(outlets.map((item) => item.average_score));

  const topOutlet = [...outlets].sort(
    (a, b) => Number(b.average_score || 0) - Number(a.average_score || 0)
  )[0];

  const lowestOutlet = [...outlets].sort(
    (a, b) => Number(a.average_score || 0) - Number(b.average_score || 0)
  )[0];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      if (editingOutlet) {
        await updateOutlet(editingOutlet.id, form);
      } else {
        await createOutlet(form);
      }

      setForm(initialForm);
      setEditingOutlet(null);
      await loadOutlets();
    } catch (error) {
      console.error("Error saving outlet:", error);
      alert("Could not save outlet.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(outlet: Outlet) {
    setEditingOutlet(outlet);

    setForm({
      name: outlet.name || "",
      area: outlet.area || "",
      manager: outlet.manager || "",
      description: outlet.description || "",
      active: outlet.active ?? true,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(outlet: Outlet) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${outlet.name}?`
    );

    if (!confirmed) return;

    try {
      await api.delete(`/training/outlets/${outlet.id}/`);
      await loadOutlets();
    } catch (error) {
      console.error("Error deleting outlet:", error);
      alert(
        "Could not delete this outlet. If it has employees or trainings assigned, deactivate it instead."
      );
    }
  }

  async function toggleActive(outlet: Outlet) {
    try {
      await updateOutlet(outlet.id, {
        active: !outlet.active,
      });

      await loadOutlets();
    } catch (error) {
      console.error("Error updating outlet:", error);
      alert("Could not update outlet status.");
    }
  }

  function cancelEdit() {
    setEditingOutlet(null);
    setForm(initialForm);
  }

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
                <Building2 size={16} />
                Outlet Performance Center
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Restaurantes & Bares A&B
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Vista ejecutiva de restaurantes, bares y áreas A&B con score,
                empleados, managers y cumplimiento de estándares.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:min-w-[420px]">
              <HeroMiniCard
                label="Top Outlet"
                value={topOutlet?.name || "N/A"}
                helper={`${topOutlet?.average_score || 0}%`}
              />
              <HeroMiniCard
                label="Needs Focus"
                value={lowestOutlet?.name || "N/A"}
                helper={`${lowestOutlet?.average_score || 0}%`}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Outlets" value={outlets.length} icon={<Building2 />} />
          <SummaryCard title="Activos" value={activeOutlets} icon={<CheckCircle2 />} />
          <SummaryCard title="Employees" value={totalEmployees} icon={<Users />} />
          <SummaryCard title="Avg A&B Score" value={`${avgOutletScore}%`} icon={<BarChart3 />} />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <form
            onSubmit={handleSubmit}
            className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6 xl:col-span-2"
          >
            <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-2xl font-black text-slate-950">
                  {editingOutlet ? "Actualizar outlet" : "Crear nuevo outlet"}
                </h2>

                <p className="text-sm text-slate-500">
                  {editingOutlet
                    ? `Editando: ${editingOutlet.name}`
                    : "Crea restaurantes, bares, buffet, room service o puntos A&B."}
                </p>
              </div>

              {editingOutlet && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 font-black text-slate-700 transition hover:bg-slate-200"
                >
                  <X size={16} />
                  Cancel edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                required
                label="Nombre"
                placeholder="Toro, Zen, Eclipse Bar..."
                value={form.name}
                onChange={(value) => setForm({ ...form, name: value })}
              />

              <Input
                label="Área"
                placeholder="Restaurant, Bar, Buffet, Room Service..."
                value={form.area}
                onChange={(value) => setForm({ ...form, area: value })}
              />

              <Input
                label="Manager encargado"
                placeholder="Nombre del manager"
                value={form.manager}
                onChange={(value) => setForm({ ...form, manager: value })}
              />

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      active: e.target.checked,
                    })
                  }
                  className="h-4 w-4 accent-slate-950"
                />
                <span className="font-bold text-slate-700">Active outlet</span>
              </label>
            </div>

            <textarea
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="Notas del outlet: enfoque, problemas, oportunidades, estándares críticos..."
              rows={4}
              value={form.description}
              onChange={(e) =>
                setForm({
                  ...form,
                  description: e.target.value,
                })
              }
            />

            <button
              disabled={saving}
              className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 disabled:opacity-50 md:w-auto"
            >
              {saving
                ? "Saving..."
                : editingOutlet
                  ? "Update outlet"
                  : "Guardar outlet"}
            </button>
          </form>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
                <Trophy size={22} />
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Outlet Ranking
                </h2>
                <p className="text-sm text-slate-500">
                  Vista rápida por score.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {[...outlets]
                .sort(
                  (a, b) =>
                    Number(b.average_score || 0) - Number(a.average_score || 0)
                )
                .slice(0, 5)
                .map((outlet, index) => (
                  <div
                    key={outlet.id}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 p-3"
                  >
                    <div>
                      <p className="font-black text-slate-950">
                        #{index + 1} {outlet.name}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {outlet.area || "No area"}
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-slate-950">
                      {outlet.average_score || 0}%
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Lista de outlets
              </h2>
              <p className="text-sm text-slate-500">
                Busca por nombre, área, manager o descripción.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:min-w-[760px]">
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="Search outlet..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={performanceFilter}
                onChange={(e) => setPerformanceFilter(e.target.value)}
              >
                <option value="all">All Performance</option>
                <option value="excellent">90+ Excellent</option>
                <option value="good">80-89 Good</option>
                <option value="attention">70-79 Attention</option>
                <option value="critical">Below 70 Critical</option>
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredOutlets.length} de {outlets.length} outlets
          </div>

          {filteredOutlets.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">No outlets found.</p>
              <p className="mt-1 text-sm text-slate-500">
                Intenta cambiar la búsqueda o los filtros.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredOutlets.map((outlet) => (
                <OutletCard
                  key={outlet.id}
                  outlet={outlet}
                  onEdit={() => handleEdit(outlet)}
                  onDelete={() => handleDelete(outlet)}
                  onToggleActive={() => toggleActive(outlet)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function OutletCard({
  outlet,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  outlet: Outlet;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}) {
  const averageScore = Number(outlet.average_score || 0);
  const hardRockScore = Number(outlet.hard_rock_score || 0);

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-2xl font-black text-slate-950">{outlet.name}</h3>
            <ScoreBadge score={averageScore} />
          </div>

          <p className="mt-1 text-sm font-semibold text-slate-500">
            {outlet.area || "No area"} · Manager: {outlet.manager || "No manager"}
          </p>
        </div>

        <button
          onClick={onToggleActive}
          className={`rounded-full px-3 py-1 text-xs font-black ${
            outlet.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {outlet.active ? "ACTIVE" : "INACTIVE"}
        </button>
      </div>

      {outlet.description && (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600">
          {outlet.description}
        </p>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <MetricBox label="Employees" value={outlet.employees_count || 0} />
        <MetricBox label="Avg Score" value={`${averageScore}%`} />
        <MetricBox label="HR Standard" value={`${hardRockScore}%`} />
      </div>

      <div className="mt-5 space-y-4">
        <ScoreBar label="Outlet Performance" value={averageScore} />
        <ScoreBar label="Hard Rock Compliance" value={hardRockScore} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={onEdit}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
        >
          <Edit3 size={15} />
          Edit
        </button>

        <button
          onClick={onDelete}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-700 transition hover:bg-red-100"
        >
          <Trash2 size={15} />
          Delete
        </button>

        <button
          onClick={onToggleActive}
          className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-100"
        >
          {outlet.active ? "Deactivate" : "Activate"}
        </button>
      </div>
    </div>
  );
}

function HeroMiniCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-3xl bg-white/10 p-5">
      <p className="text-sm font-semibold text-white/60">{label}</p>
      <p className="mt-2 truncate text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm text-white/60">{helper}</p>
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

function MetricBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const cleanValue = Number(value || 0);

  return (
    <div>
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-bold text-slate-600">{label}</span>
        <span className="font-black text-slate-950">{cleanValue}%</span>
      </div>

      <div className="h-3 rounded-full bg-slate-200">
        <div
          className={`h-3 rounded-full ${getScoreBarColor(cleanValue)}`}
          style={{
            width: `${Math.min(cleanValue, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const label =
    score >= 90
      ? "Excellent"
      : score >= 80
        ? "Good"
        : score >= 70
          ? "Attention"
          : "Critical";

  const styles =
    score >= 90
      ? "bg-emerald-100 text-emerald-700"
      : score >= 80
        ? "bg-blue-100 text-blue-700"
        : score >= 70
          ? "bg-amber-100 text-amber-700"
          : "bg-red-100 text-red-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${styles}`}>
      {label}
    </span>
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

function getScoreBarColor(score: number) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 80) return "bg-blue-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
}

function getAverage(values: number[]) {
  if (!values.length) return 0;

  const cleanValues = values.filter((value) => value > 0);

  if (!cleanValues.length) return 0;

  const total = cleanValues.reduce((sum, value) => sum + value, 0);

  return Math.round(total / cleanValues.length);
}