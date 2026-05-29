import { useEffect, useState } from "react";
import { getTrainingDashboard } from "../api/trainingApi";
import type { TrainingDashboard } from "../types/training";
import RoadmapSection from "../components/RoadmapSection";

export default function TrainingDashboardPage() {
  const [data, setData] = useState<TrainingDashboard | null>(null);

  useEffect(() => {
    getTrainingDashboard().then(setData);
  }, []);

  if (!data) return <div className="p-6">Loading dashboard...</div>;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">A&B Training Command Center</h1>
        <p className="text-gray-500">
          Vista rápida de entrenamientos, talento, estándares y próximos pasos.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Personas en entrenamiento hoy" value={data.people_training_today} />
        <StatCard title="Entrenamientos hoy" value={data.trainings_today} />
        <StatCard title="Facilitadores activos" value={data.facilitators_total} />
        <StatCard title="A&B Performance Score" value={`${data.ab_performance_score}%`} />
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Próximo entrenamiento</h2>

        {data.next_training ? (
          <div className="mt-3">
            <p className="text-lg font-bold">{data.next_training.title}</p>
            <p className="text-gray-500">{data.next_training.topic}</p>
            <p className="text-sm text-gray-400">
              {new Date(data.next_training.start_datetime).toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-gray-500">No hay entrenamiento programado.</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Top empleados ahora mismo</h2>

          <div className="mt-4 space-y-3">
            {data.top_employees.map((emp, index) => (
              <div key={emp.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                <div>
                  <p className="font-semibold">
                    #{index + 1} {emp.name}
                  </p>
                  <p className="text-sm text-gray-500">
                    {emp.position} · {emp.outlet_name}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xl font-bold">{emp.total_score}%</p>
                  <p className="text-xs text-gray-500">{emp.potential_level}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">Qué estamos lacking</h2>

          <div className="mt-4 space-y-3">
            <LackingItem title="Upselling premium" level="Alto" />
            <LackingItem title="Conocimiento de menú" level="Medio" />
            <LackingItem title="Consistencia del saludo" level="Medio" />
            <LackingItem title="Velocidad de servicio" level="Alto" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <RoadmapSection title="Próximos 30 días" items={data.roadmap_30} />
        <RoadmapSection title="Próximos 60 días" items={data.roadmap_60} />
        <RoadmapSection title="Próximos 90 días" items={data.roadmap_90} />
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function LackingItem({ title, level }: { title: string; level: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-red-50 p-3">
      <p className="font-medium">{title}</p>
      <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700">{level}</span>
    </div>
  );
}

function RoadmapCard({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">{title}</h2>

      <div className="mt-4 space-y-3">
        {items.length === 0 && <p className="text-sm text-gray-500">No items yet.</p>}

        {items.map((item) => (
          <div key={item.id} className="rounded-xl bg-gray-50 p-3">
            <p className="font-semibold">{item.title}</p>
            <p className="text-sm text-gray-500">{item.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}