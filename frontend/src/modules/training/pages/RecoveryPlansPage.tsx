import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  RefreshCcw,
  Search,
  TimerReset,
} from "lucide-react";

import { getStandards } from "../api/trainingApi";
import {
  recoveryPlansApi,
  trainingResourcesApi,
} from "../api/trainingRecoveryApi";
import type {
  Standard,
  StandardRecoveryPlan,
  TrainingResource,
} from "../types/training";

const initialForm = {
  standard: "",
  resource: "",
  trigger_fail_count: 1,
  reevaluation_after_days: 3,
  instructions: "",
  active: true,
};

export default function RecoveryPlansPage() {
  const [plans, setPlans] = useState<StandardRecoveryPlan[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [resources, setResources] = useState<TrainingResource[]>([]);

  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const [form, setForm] = useState(initialForm);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      setLoading(true);

      const [plansResponse, resourcesResponse, standardsData] =
        await Promise.all([
          recoveryPlansApi.list(),
          trainingResourcesApi.list(),
          getStandards(),
        ]);

      setPlans(plansResponse.data);
      setResources(resourcesResponse.data);
      setStandards(
        Array.isArray(standardsData) ? standardsData : standardsData.results || [],
      );
    } catch (error) {
      console.error("Error loading recovery plans:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.standard) {
      alert("Debe seleccionar un estándar.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        standard: Number(form.standard),
        resource: form.resource ? Number(form.resource) : null,
        trigger_fail_count: Number(form.trigger_fail_count),
        reevaluation_after_days: Number(form.reevaluation_after_days),
        instructions: form.instructions,
        active: form.active,
      };

      await recoveryPlansApi.create(payload);

      setForm(initialForm);
      await loadData();
    } catch (error) {
      console.error("Error creating recovery plan:", error);
      alert(
        "Could not create recovery plan. Verifica si ese estándar ya tiene un plan.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(plan: StandardRecoveryPlan) {
    try {
      await recoveryPlansApi.update(plan.id, {
        active: !plan.active,
      });

      await loadData();
    } catch (error) {
      console.error("Error updating recovery plan:", error);
      alert("Could not update recovery plan.");
    }
  }

  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      const value = `
        ${plan.standard_title || ""}
        ${plan.resource_title || ""}
        ${plan.instructions || ""}
      `.toLowerCase();

      const matchesSearch = value.includes(search.toLowerCase());

      const matchesActive =
        activeFilter === "all" ||
        (activeFilter === "active" && plan.active) ||
        (activeFilter === "inactive" && !plan.active);

      return matchesSearch && matchesActive;
    });
  }, [plans, search, activeFilter]);

  const activeCount = plans.filter((plan) => plan.active).length;
  const withoutResourceCount = plans.filter((plan) => !plan.resource).length;
  const fastReevaluationCount = plans.filter(
    (plan) => plan.reevaluation_after_days <= 3,
  ).length;

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
                <RefreshCcw size={16} />
                Planes de Reforzamiento
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Recovery Plans A&B
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Define qué recurso debe asignarse automáticamente cuando un
                colaborador no cumple un estándar durante una evaluación.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5">
              <p className="text-sm font-semibold text-white/60">
                Planes Activos
              </p>
              <p className="mt-2 text-4xl font-black">{activeCount}</p>
              <p className="mt-1 text-sm text-white/60">
                listos para asignación
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Planes" value={plans.length} icon={<BookOpenCheck />} />
          <SummaryCard title="Activos" value={activeCount} icon={<CheckCircle2 />} />
          <SummaryCard title="Sin Recurso" value={withoutResourceCount} icon={<AlertTriangle />} />
          <SummaryCard title="Re-eval ≤ 3 días" value={fastReevaluationCount} icon={<TimerReset />} />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5">
            <h2 className="text-2xl font-black text-slate-950">
              Crear Plan de Reforzamiento
            </h2>
            <p className="text-sm text-slate-500">
              Conecta un estándar con un recurso visual y define cuándo debe
              re-evaluarse.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Select
              label="Estándar"
              value={form.standard}
              onChange={(value) => setForm({ ...form, standard: value })}
            >
              <option value="">Seleccionar estándar</option>
              {standards.map((standard) => (
                <option key={standard.id} value={String(standard.id)}>
                  {standard.title}
                </option>
              ))}
            </Select>

            <Select
              label="Recurso"
              value={form.resource}
              onChange={(value) => setForm({ ...form, resource: value })}
            >
              <option value="">Sin recurso</option>
              {resources.map((resource) => (
                <option key={resource.id} value={String(resource.id)}>
                  {resource.title}
                </option>
              ))}
            </Select>

            <Input
              label="Fallos para Activar"
              type="number"
              value={String(form.trigger_fail_count)}
              onChange={(value) =>
                setForm({
                  ...form,
                  trigger_fail_count: Number(value),
                })
              }
            />

            <Input
              label="Re-evaluar en Días"
              type="number"
              value={String(form.reevaluation_after_days)}
              onChange={(value) =>
                setForm({
                  ...form,
                  reevaluation_after_days: Number(value),
                })
              }
            />
          </div>

          <textarea
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="Instrucciones: Ej. Dar feedback inmediato, asignar microtraining de 5 minutos y re-evaluar en 72 horas."
            rows={4}
            value={form.instructions}
            onChange={(e) =>
              setForm({
                ...form,
                instructions: e.target.value,
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
            {saving ? "Guardando..." : "Guardar Recovery Plan"}
          </button>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Biblioteca de Recovery Plans
              </h2>
              <p className="text-sm text-slate-500">
                Cada estándar debe tener un plan claro de reforzamiento.
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
                  placeholder="Buscar por estándar o recurso..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={activeFilter}
                onChange={(e) => setActiveFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredPlans.length} de {plans.length} planes
          </div>

          {filteredPlans.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">
                No hay recovery plans.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Crea el primer plan conectando un estándar con un recurso.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredPlans.map((plan) => (
                <RecoveryPlanCard
                  key={plan.id}
                  plan={plan}
                  onToggleActive={() => toggleActive(plan)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RecoveryPlanCard({
  plan,
  onToggleActive,
}: {
  plan: StandardRecoveryPlan;
  onToggleActive: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              {plan.standard_title || `Estándar #${plan.standard}`}
            </h3>

            <p className="mt-1 text-sm font-bold text-slate-500">
              Recurso: {plan.resource_title || "Sin recurso asignado"}
            </p>
          </div>

          <button
            onClick={onToggleActive}
            className={`rounded-full px-3 py-1 text-xs font-black ${
              plan.active
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {plan.active ? "ACTIVE" : "INACTIVE"}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoBox
            label="Fallos para Activar"
            value={`${plan.trigger_fail_count}`}
          />
          <InfoBox
            label="Re-evaluación"
            value={`${plan.reevaluation_after_days} días`}
          />
        </div>

        {plan.instructions && (
          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              Instrucciones
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {plan.instructions}
            </p>
          </div>
        )}
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        required={required}
        type={type}
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