import { useEffect, useMemo, useState } from "react";
import {
  getTrainingAnalytics,
  getTrainingDashboard,
  getTrainingSessions,
} from "../api/trainingApi";
import type {
  TrainingAnalytics,
  TrainingDashboard,
  TrainingSession,
} from "../types/training";

export default function ReportsPage() {
  const [analytics, setAnalytics] = useState<TrainingAnalytics | null>(null);
  const [dashboard, setDashboard] = useState<TrainingDashboard | null>(null);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);

  useEffect(() => {
    async function loadData() {
      const [analyticsData, dashboardData, sessionsData] = await Promise.all([
        getTrainingAnalytics(),
        getTrainingDashboard(),
        getTrainingSessions(),
      ]);

      setAnalytics(analyticsData);
      setDashboard(dashboardData);
      setSessions(sessionsData);
    }

    loadData();
  }, []);

  const completedSessions = useMemo(
    () => sessions.filter((session) => session.status === "completed"),
    [sessions]
  );

  const scheduledSessions = useMemo(
    () => sessions.filter((session) => session.status === "scheduled"),
    [sessions]
  );

  if (!analytics || !dashboard) {
    return <div className="p-6">Loading report...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold">Executive Reports</h1>
          <p className="text-gray-500">
            Resumen ejecutivo de A&B Training, talento, estándares y próximos pasos.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="rounded-xl bg-black px-5 py-3 font-semibold text-white"
        >
          Print / Save PDF
        </button>
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold">Weekly Executive Summary</h2>
        <p className="mt-2 text-gray-600">
          Este reporte muestra el estado actual del programa de capacitación A&B,
          incluyendo desempeño general, cumplimiento de estándares, entrenamientos,
          talento destacado y áreas que necesitan coaching.
        </p>

        <div className="mt-4 text-sm text-gray-500">
          Generated: {new Date().toLocaleString()}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <ReportMetric
          label="A&B Performance"
          value={`${analytics.ab_performance_score}%`}
        />
        <ReportMetric
          label="Hard Rock Score"
          value={`${analytics.hard_rock_score}%`}
        />
        <ReportMetric
          label="Training Completion"
          value={`${analytics.training_completion}%`}
        />
        <ReportMetric
          label="People Training Today"
          value={dashboard.people_training_today}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ReportSection title="Top Performers">
          <div className="space-y-3">
            {analytics.top_employees.map((employee, index) => (
              <ReportRow
                key={employee.id}
                title={`#${index + 1} ${employee.name}`}
                subtitle={`${employee.position} · ${employee.outlet_name || "No outlet"}`}
                value={`${employee.total_score}%`}
              />
            ))}
          </div>
        </ReportSection>

        <ReportSection title="Employees Needing Coaching">
          <div className="space-y-3">
            {analytics.low_performers.map((employee, index) => (
              <ReportRow
                key={employee.id}
                title={`#${index + 1} ${employee.name}`}
                subtitle={`${employee.position} · ${employee.outlet_name || "No outlet"}`}
                value={`${employee.total_score}%`}
              />
            ))}
          </div>
        </ReportSection>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ReportSection title="Top Outlets">
          <div className="space-y-3">
            {analytics.top_outlets.map((outlet) => (
              <ReportRow
                key={outlet.name}
                title={outlet.name}
                subtitle={`${outlet.employees_count} employees · HR Score ${outlet.hard_rock_score}%`}
                value={`${outlet.score}%`}
              />
            ))}
          </div>
        </ReportSection>

        <ReportSection title="Training Activity">
          <div className="space-y-3">
            <ReportRow
              title="Completed Trainings"
              subtitle="Sessions already completed"
              value={completedSessions.length}
            />
            <ReportRow
              title="Scheduled Trainings"
              subtitle="Upcoming sessions"
              value={scheduledSessions.length}
            />
            <ReportRow
              title="Total Trainings"
              subtitle="All sessions registered"
              value={sessions.length}
            />
          </div>
        </ReportSection>
      </div>

      <ReportSection title="Next Training">
        {dashboard.next_training ? (
          <div className="rounded-xl bg-gray-50 p-4">
            <h3 className="text-lg font-bold">{dashboard.next_training.title}</h3>
            <p className="text-gray-500">{dashboard.next_training.topic}</p>
            <p className="mt-2 text-sm text-gray-400">
              {new Date(dashboard.next_training.start_datetime).toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No upcoming training found.</p>
        )}
      </ReportSection>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <RoadmapReport title="30 Days" items={dashboard.roadmap_30} />
        <RoadmapReport title="60 Days" items={dashboard.roadmap_60} />
        <RoadmapReport title="90 Days" items={dashboard.roadmap_90} />
      </div>

      <ReportSection title="Executive Notes">
        <div className="space-y-3 text-gray-700">
          <p>
            Main focus should remain on improving service consistency, Hard Rock
            standards, speed of service, guest engagement, and upselling culture.
          </p>
          <p>
            Top performers should be considered for recognition, mentorship roles,
            or future leadership development.
          </p>
          <p>
            Low performers should receive coaching plans, direct observation, and
            follow-up evaluations within the next 7 to 14 days.
          </p>
        </div>
      </ReportSection>
    </div>
  );
}

function ReportMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

function ReportSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </div>
  );
}

function ReportRow({
  title,
  subtitle,
  value,
}: {
  title: string;
  subtitle: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-gray-50 p-4">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>

      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function RoadmapReport({
  title,
  items,
}: {
  title: string;
  items: any[];
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No roadmap items.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl bg-gray-50 p-4">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-gray-500">{item.description}</p>
              <p className="mt-2 text-xs font-semibold text-gray-400">
                {item.completed ? "COMPLETED" : "IN PROGRESS"}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}