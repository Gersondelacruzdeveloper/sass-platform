import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  TrendingUp,
  Users,
} from "lucide-react";
import { getTrainingDashboard } from "../api/trainingApi";
import type { TrainingDashboard } from "../types/training";
import RoadmapSection from "../components/RoadmapSection";

export default function TrainingDashboardPage() {
  const [data, setData] = useState<TrainingDashboard | null>(null);

  useEffect(() => {
    getTrainingDashboard().then(setData);
  }, []);

  const performanceStatus = useMemo(() => {
    const score = data?.ab_performance_score ?? 0;

    if (score >= 85) return { label: "Excelente", color: "text-emerald-700", bg: "bg-emerald-50", bar: "bg-emerald-500" };
    if (score >= 70) return { label: "En progreso", color: "text-amber-700", bg: "bg-amber-50", bar: "bg-amber-500" };

    return { label: "Atención requerida", color: "text-red-700", bg: "bg-red-50", bar: "bg-red-500" };
  }, [data]);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-12 w-72 rounded-2xl bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-32 rounded-3xl bg-slate-200" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const performance = Number(data.ab_performance_score || 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                <GraduationCap size={16} />
                A&B Training Command Center
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Vista ejecutiva de capacitación
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Progreso rápido, próximos entrenamientos, talento destacado y áreas críticas para que gerentes y directores tomen acción sin perder tiempo.
              </p>
            </div>

            <div className={`rounded-3xl ${performanceStatus.bg} p-5 text-slate-950 lg:min-w-80`}>
              <p className="text-sm font-semibold text-slate-500">A&B Performance Score</p>

              <div className="mt-2 flex items-end justify-between">
                <p className="text-5xl font-black">{performance}%</p>
                <span className={`rounded-full px-3 py-1 text-sm font-bold ${performanceStatus.color} bg-white`}>
                  {performanceStatus.label}
                </span>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full ${performanceStatus.bar}`}
                  style={{ width: `${Math.min(performance, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            title="Personas en entrenamiento hoy"
            value={data.people_training_today}
            icon={<Users size={22} />}
            helper="Participación del día"
          />

          <StatCard
            title="Entrenamientos hoy"
            value={data.trainings_today}
            icon={<ClipboardList size={22} />}
            helper="Sesiones programadas"
          />

          <StatCard
            title="Facilitadores activos"
            value={data.facilitators_total}
            icon={<CheckCircle2 size={22} />}
            helper="Apoyando evaluaciones"
          />

          <StatCard
            title="Score general"
            value={`${data.ab_performance_score}%`}
            icon={<TrendingUp size={22} />}
            helper="Resultado operativo"
          />
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-1">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                <CalendarClock size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Próximo entrenamiento</h2>
                <p className="text-sm text-slate-500">Lo próximo que debe pasar</p>
              </div>
            </div>

            {data.next_training ? (
              <div className="mt-5 rounded-3xl bg-slate-50 p-4">
                <p className="text-lg font-black text-slate-950">{data.next_training.title}</p>
                <p className="mt-1 text-sm font-medium text-slate-600">{data.next_training.topic}</p>
                <p className="mt-3 rounded-full bg-white px-3 py-2 text-sm font-semibold text-slate-500">
                  {new Date(data.next_training.start_datetime).toLocaleString()}
                </p>
              </div>
            ) : (
              <p className="mt-5 rounded-3xl bg-slate-50 p-4 text-sm text-slate-500">
                No hay entrenamiento programado.
              </p>
            )}
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-slate-950">Top empleados ahora mismo</h2>
                <p className="text-sm text-slate-500">Talento con mejor progreso</p>
              </div>

              <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                Top {data.top_employees.length}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {data.top_employees.map((emp, index) => (
                <div
                  key={emp.id}
                  className="flex items-center justify-between gap-4 rounded-3xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white">
                      #{index + 1}
                    </div>

                    <div>
                      <p className="font-black text-slate-950">{emp.name}</p>
                      <p className="text-sm text-slate-500">
                        {emp.position} · {emp.outlet_name}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-950">{emp.total_score}%</p>
                    <p className="text-xs font-semibold text-slate-500">{emp.potential_level}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-red-100 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-red-50 p-3 text-red-700">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Áreas críticas</h2>
                <p className="text-sm text-slate-500">Lo que más necesita atención</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <LackingItem title="Upselling premium" level="Alto" />
              <LackingItem title="Conocimiento de menú" level="Medio" />
              <LackingItem title="Consistencia del saludo" level="Medio" />
              <LackingItem title="Velocidad de servicio" level="Alto" />
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Resumen ejecutivo</h2>
            <p className="mt-1 text-sm text-slate-500">
              Lectura rápida para dirección.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MiniInsight label="Estado" value={performanceStatus.label} />
              <MiniInsight label="Hoy" value={`${data.trainings_today} sesiones`} />
              <MiniInsight label="Facilitadores" value={data.facilitators_total} />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <RoadmapSection title="Próximos 30 días" items={data.roadmap_30} />
          <RoadmapSection title="Próximos 60 días" items={data.roadmap_60} />
          <RoadmapSection title="Próximos 90 días" items={data.roadmap_90} />
        </section>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string | number;
  helper: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{value}</p>
        </div>

        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          {icon}
        </div>
      </div>

      <p className="mt-4 text-sm font-medium text-slate-400">{helper}</p>
    </div>
  );
}

function LackingItem({ title, level }: { title: string; level: string }) {
  const isHigh = level.toLowerCase() === "alto";

  return (
    <div className="flex items-center justify-between gap-4 rounded-3xl bg-slate-50 p-4">
      <div>
        <p className="font-black text-slate-950">{title}</p>
        <p className="text-sm text-slate-500">Requiere seguimiento operativo</p>
      </div>

      <span
        className={`rounded-full px-3 py-1 text-sm font-black ${
          isHigh
            ? "bg-red-100 text-red-700"
            : "bg-amber-100 text-amber-700"
        }`}
      >
        {level}
      </span>
    </div>
  );
}

function MiniInsight({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}