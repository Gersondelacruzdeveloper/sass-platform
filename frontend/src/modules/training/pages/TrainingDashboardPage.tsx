import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  MapPin,
  RefreshCcw,
  Target,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";

import {
  getEmployeeEvaluations,
  getTrainingAnalytics,
  getTrainingDashboard,
} from "../api/trainingApi";

import { assignedTrainingsApi } from "../api/trainingRecoveryApi";

import type {
  EmployeeAssignedTraining,
  EmployeeEvaluation,
  TrainingAnalytics,
  TrainingDashboard,
} from "../types/training";

import RoadmapSection from "../components/RoadmapSection";

type DashboardState = {
  dashboard: TrainingDashboard;
  analytics: TrainingAnalytics;
  evaluations: EmployeeEvaluation[];
  assignedTrainings: EmployeeAssignedTraining[];
};

type StandardSummary = {
  name: string;
  total: number;
  assigned: number;
  inProgress: number;
  reevaluation: number;
  closed: number;
};

export default function TrainingDashboardPage() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    try {
      setLoading(true);

      const [
        dashboard,
        analytics,
        evaluations,
        assignedTrainingsResponse,
      ] = await Promise.all([
        getTrainingDashboard(),
        getTrainingAnalytics(),
        getEmployeeEvaluations(),
        assignedTrainingsApi.list(),
      ]);

      setData({
        dashboard,
        analytics,
        evaluations,
        assignedTrainings: assignedTrainingsResponse.data,
      });
    } catch (error) {
      console.error("Error loading executive dashboard:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const standardSummaries = useMemo(() => {
    if (!data) return [];

    const grouped = new Map<string, StandardSummary>();

    data.assignedTrainings.forEach((item) => {
      const key = item.standard_title || `Estándar #${item.standard}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          name: key,
          total: 0,
          assigned: 0,
          inProgress: 0,
          reevaluation: 0,
          closed: 0,
        });
      }

      const current = grouped.get(key)!;
      current.total += 1;

      if (item.status === "assigned") current.assigned += 1;
      if (item.status === "in_progress") current.inProgress += 1;
      if (item.status === "reevaluation_pending") current.reevaluation += 1;
      if (item.status === "closed") current.closed += 1;
    });

    return Array.from(grouped.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  const suggestedCampaigns = useMemo(() => {
    return standardSummaries.slice(0, 3).map((standard, index) => ({
      id: index + 1,
      title: `Campaña de refuerzo: ${standard.name}`,
      focus: standard.name,
      target: `${standard.total} casos detectados`,
      priority:
        standard.total >= 10 ? "Alta" : standard.total >= 5 ? "Media" : "Baja",
    }));
  }, [standardSummaries]);

  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-44 rounded-[2rem] bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-32 rounded-3xl bg-slate-200" />
            ))}
          </div>
          <div className="h-96 rounded-[2rem] bg-slate-200" />
        </div>
      </div>
    );
  }

  const { dashboard, analytics, evaluations, assignedTrainings } = data;

  const executiveScore = Number(
    analytics.ab_performance_score ||
      dashboard.ab_performance_score ||
      0,
  );

  const microtrainingsTotal = assignedTrainings.length;

  const microtrainingsOpen = assignedTrainings.filter(
    (item) => item.status !== "closed",
  ).length;

  const microtrainingsCompleted = assignedTrainings.filter(
    (item) => item.status === "closed",
  ).length;

  const reevaluationsPending = assignedTrainings.filter(
    (item) => item.status === "reevaluation_pending",
  ).length;

  const reevaluationCompletion =
    microtrainingsTotal > 0
      ? Math.round((microtrainingsCompleted / microtrainingsTotal) * 100)
      : 0;

  const collaboratorsEvaluated = new Set(
    evaluations.map((evaluation) => evaluation.employee),
  ).size;

  const performanceStatus =
    executiveScore >= 85
      ? {
          label: "Excelente",
          color: "text-emerald-700",
          bg: "bg-emerald-50",
          border: "border-emerald-100",
          bar: "bg-emerald-500",
        }
      : executiveScore >= 70
        ? {
            label: "En recuperación",
            color: "text-amber-700",
            bg: "bg-amber-50",
            border: "border-amber-100",
            bar: "bg-amber-500",
          }
        : {
            label: "Atención requerida",
            color: "text-red-700",
            bg: "bg-red-50",
            border: "border-red-100",
            bar: "bg-red-500",
          };

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <section className="overflow-hidden rounded-[2rem] bg-[#0B3D91] p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white/80">
                <BarChart3 size={16} />
                Dashboard Ejecutivo A&B
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Estándares, seguimiento y acciones correctivas
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75 md:text-base">
                Vista ejecutiva conectada a datos reales del sistema:
                evaluaciones, colaboradores, facilitadores, microtrainings,
                reevaluaciones y desempeño por outlet.
              </p>
            </div>

            <div
              className={`rounded-3xl border ${performanceStatus.border} ${performanceStatus.bg} p-5 text-slate-950 lg:min-w-80`}
            >
              <p className="text-sm font-bold text-slate-500">
                Cumplimiento general A&B
              </p>

              <div className="mt-2 flex items-end justify-between gap-4">
                <p className="text-5xl font-black">{executiveScore}%</p>

                <span
                  className={`rounded-full bg-white px-3 py-1 text-sm font-black ${performanceStatus.color}`}
                >
                  {performanceStatus.label}
                </span>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${performanceStatus.bar}`}
                  style={{ width: `${Math.min(executiveScore, 100)}%` }}
                />
              </div>

              <p className="mt-3 text-xs font-semibold text-slate-500">
                Basado en las evaluaciones y métricas actuales registradas.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ExecutiveStatCard
            title="Colaboradores evaluados"
            value={collaboratorsEvaluated}
            helper={`${evaluations.length} evaluaciones registradas`}
            icon={<Users size={22} />}
          />

          <ExecutiveStatCard
            title="Microtrainings"
            value={microtrainingsTotal}
            helper={`${microtrainingsOpen} casos abiertos`}
            icon={<Video size={22} />}
          />

          <ExecutiveStatCard
            title="Reevaluaciones"
            value={`${reevaluationCompletion}%`}
            helper={`${reevaluationsPending} pendientes`}
            icon={<RefreshCcw size={22} />}
          />

          <ExecutiveStatCard
            title="Facilitadores"
            value={dashboard.facilitators_total}
            helper="Red interna activa"
            icon={<GraduationCap size={22} />}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Estándares con más refuerzos asignados
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Basado en los microtrainings generados por evaluaciones reales.
                </p>
              </div>

              <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-sm font-black text-amber-700">
                <AlertTriangle size={15} />
                Prioridad operativa
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {standardSummaries.length === 0 ? (
                <EmptyState text="Todavía no hay microtrainings asignados por estándar." />
              ) : (
                standardSummaries.slice(0, 5).map((standard) => (
                  <StandardSummaryRow
                    key={standard.name}
                    standard={standard}
                  />
                ))
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-[#0B3D91]">
                <MapPin size={22} />
              </div>

              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Outlets con oportunidad
                </h2>
                <p className="text-sm text-slate-500">
                  Según analytics del sistema.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {analytics.bottom_outlets?.length ? (
                analytics.bottom_outlets.slice(0, 5).map((outlet) => (
                  <OutletOpportunityCard
                    key={outlet.name}
                    name={outlet.name}
                    score={outlet.score}
                    employeesCount={outlet.employees_count}
                    hardRockScore={outlet.hard_rock_score}
                  />
                ))
              ) : (
                <EmptyState text="No hay suficientes datos por outlet todavía." />
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Acciones correctivas reales
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Seguimiento automático generado por el sistema.
                </p>
              </div>

              <span className="rounded-full bg-[#C8A85D]/15 px-3 py-1 text-sm font-black text-[#A88638]">
                Datos en vivo
              </span>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              <ActionCard
                icon={<Video size={22} />}
                title="Refuerzos"
                value={String(microtrainingsTotal)}
                description="Microtrainings asignados por desviaciones."
              />

              <ActionCard
                icon={<ClipboardCheck size={22} />}
                title="Pendientes"
                value={String(microtrainingsOpen)}
                description="Casos que todavía requieren seguimiento."
              />

              <ActionCard
                icon={<Target size={22} />}
                title="Reevaluar"
                value={String(reevaluationsPending)}
                description="Casos esperando validación en operación."
              />
            </div>

            <div className="mt-5 rounded-3xl bg-slate-50 p-5">
              <p className="text-sm font-bold uppercase tracking-wide text-slate-500">
                Insight operativo
              </p>

              {standardSummaries.length > 0 ? (
                <>
                  <p className="mt-2 text-lg font-black text-slate-950">
                    El estándar con más refuerzos asignados es “
                    {standardSummaries[0].name}”.
                  </p>

                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Tiene {standardSummaries[0].total} caso(s) registrados.
                    Acción sugerida: revisar recursos visuales, reforzar en piso
                    y dar seguimiento a las reevaluaciones pendientes.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Cuando comiencen a registrarse evaluaciones fallidas, este
                  bloque mostrará automáticamente el estándar más crítico.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">
              Campañas sugeridas
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Generadas a partir de estándares con más refuerzos.
            </p>

            <div className="mt-5 space-y-3">
              {suggestedCampaigns.length === 0 ? (
                <EmptyState text="No hay campañas sugeridas todavía." />
              ) : (
                suggestedCampaigns.map((campaign) => (
                  <CampaignCard key={campaign.id} campaign={campaign} />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                Mecanismo de mejora continua
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Del diagnóstico al resultado medible.
              </p>
            </div>

            <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-black text-[#0B3D91]">
              Evaluar → Corregir → Reevaluar → Medir
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-6">
            <ProcessStep number="1" title="Diagnóstico" />
            <ProcessStep number="2" title="Estándares" />
            <ProcessStep number="3" title="Evaluación" />
            <ProcessStep number="4" title="Refuerzo" />
            <ProcessStep number="5" title="Reevaluación" />
            <ProcessStep number="6" title="Resultados" />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <RoadmapSection title="Próximos 30 días" items={dashboard.roadmap_30} />
          <RoadmapSection title="Próximos 60 días" items={dashboard.roadmap_60} />
          <RoadmapSection title="Próximos 90 días" items={dashboard.roadmap_90} />
        </section>
      </div>
    </div>
  );
}

function ExecutiveStatCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">
            {value}
          </p>
        </div>

        <div className="rounded-2xl bg-blue-50 p-3 text-[#0B3D91]">
          {icon}
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function StandardSummaryRow({ standard }: { standard: StandardSummary }) {
  const completion =
    standard.total > 0 ? Math.round((standard.closed / standard.total) * 100) : 0;

  const intensity =
    standard.total >= 10
      ? "bg-red-500"
      : standard.total >= 5
        ? "bg-amber-500"
        : "bg-blue-500";

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-black text-slate-950">{standard.name}</p>
          <p className="mt-1 text-sm text-slate-500">
            {standard.total} refuerzos · {standard.reevaluation} en re-evaluación ·{" "}
            {standard.closed} cerrados
          </p>
        </div>

        <div className="md:min-w-44">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-500">
              avance
            </span>
            <span className="text-lg font-black text-slate-950">
              {completion}%
            </span>
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${intensity}`}
              style={{ width: `${Math.min(completion, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function OutletOpportunityCard({
  name,
  score,
  employeesCount,
  hardRockScore,
}: {
  name: string;
  score: number;
  employeesCount: number;
  hardRockScore: number;
}) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-slate-950">{name}</p>
          <p className="mt-1 text-sm text-slate-500">
            {employeesCount} colaboradores
          </p>
        </div>

        <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-[#0B3D91]">
          {Math.round(score)}%
        </span>
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">
        Hard Rock Score: {Math.round(hardRockScore)}%
      </p>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  value,
  description,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-white p-3 text-[#0B3D91]">
          {icon}
        </div>

        <div>
          <p className="text-3xl font-black text-slate-950">{value}</p>
          <p className="text-sm font-black text-slate-700">{title}</p>
        </div>
      </div>

      <p className="mt-3 text-sm leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function CampaignCard({
  campaign,
}: {
  campaign: {
    id: number;
    title: string;
    focus: string;
    target: string;
    priority: string;
  };
}) {
  const priorityClass =
    campaign.priority === "Alta"
      ? "bg-red-50 text-red-700"
      : campaign.priority === "Media"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";

  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-slate-950">{campaign.title}</p>
          <p className="mt-1 text-sm text-slate-500">{campaign.focus}</p>
        </div>

        <span className={`rounded-full px-3 py-1 text-xs font-black ${priorityClass}`}>
          {campaign.priority}
        </span>
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">
        {campaign.target}
      </p>
    </div>
  );
}

function ProcessStep({ number, title }: { number: string; title: string }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-[#C8A85D] text-sm font-black text-white">
        {number}
      </div>

      <p className="mt-3 text-sm font-black text-[#0B3D91]">{title}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-6 text-center">
      <p className="text-sm font-semibold text-slate-500">{text}</p>
    </div>
  );
}