import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  GraduationCap,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
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

  const completedRate = analytics.trainings_total
    ? Math.round(
        (analytics.completed_trainings / analytics.trainings_total) * 100
      )
    : 0;

  const bestOutlet = [...analytics.top_outlets].sort(
    (a, b) => Number(b.score || 0) - Number(a.score || 0)
  )[0];

  const lowestOutlet = [...analytics.top_outlets].sort(
    (a, b) => Number(a.score || 0) - Number(b.score || 0)
  )[0];

  const generatedAt = new Date().toLocaleString();

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8 print:max-w-none print:p-0">
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8 print:rounded-none print:bg-white print:text-slate-950 print:shadow-none">
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80 print:bg-slate-100 print:text-slate-700">
                <FileText size={16} />
                Executive Report
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                A&B Training Report
              </h1>

              <p className="mt-3 max-w-3xl text-sm text-white/65 md:text-base print:text-slate-600">
                Resumen ejecutivo de rendimiento A&B, estándares Hard Rock,
                entrenamientos, talento destacado y próximos pasos.
              </p>

              <p className="mt-4 text-sm font-semibold text-white/50 print:text-slate-500">
                Generated: {generatedAt}
              </p>
            </div>

            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-950 transition hover:bg-slate-100 print:hidden"
            >
              <Download size={18} />
              Print / Save PDF
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <ReportMetric
            label="A&B Performance"
            value={`${analytics.ab_performance_score}%`}
            icon={<Sparkles />}
            score={analytics.ab_performance_score}
          />

          <ReportMetric
            label="Hard Rock Score"
            value={`${analytics.hard_rock_score}%`}
            icon={<Trophy />}
            score={analytics.hard_rock_score}
          />

          <ReportMetric
            label="Training Completion"
            value={`${analytics.training_completion}%`}
            icon={<GraduationCap />}
            score={analytics.training_completion}
          />

          <ReportMetric
            label="People Training Today"
            value={dashboard.people_training_today}
            icon={<Users />}
          />
        </section>

        <ReportSection
          title="Weekly Executive Summary"
          subtitle="Vista rápida para dirección"
        >
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <InsightCard
              type="success"
              title="Best Outlet"
              value={bestOutlet?.name || "N/A"}
              description={`Current performance score: ${bestOutlet?.score || 0}%. Use this outlet as a reference for best practices.`}
            />

            <InsightCard
              type="warning"
              title="Needs Focus"
              value={lowestOutlet?.name || "N/A"}
              description={`Current performance score: ${lowestOutlet?.score || 0}%. Prioritize coaching, standards observation, and follow-up.`}
            />

            <InsightCard
              type="info"
              title="Training Activity"
              value={`${completedRate}%`}
              description={`${completedSessions.length} completed trainings, ${scheduledSessions.length} scheduled, ${sessions.length} total sessions.`}
            />
          </div>
        </ReportSection>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ReportSection title="Top Performers" subtitle="Employees with strongest current results">
            <div className="space-y-3">
              {analytics.top_employees.length === 0 ? (
                <EmptyState text="No top performers found." />
              ) : (
                analytics.top_employees.map((employee, index) => (
                  <ReportRow
                    key={employee.id}
                    index={index + 1}
                    title={employee.name}
                    subtitle={`${employee.position} · ${employee.outlet_name || "No outlet"}`}
                    value={`${employee.total_score}%`}
                    type="success"
                  />
                ))
              )}
            </div>
          </ReportSection>

          <ReportSection title="Employees Needing Coaching" subtitle="Employees requiring follow-up">
            <div className="space-y-3">
              {analytics.low_performers.length === 0 ? (
                <EmptyState text="No employees found." />
              ) : (
                analytics.low_performers.map((employee, index) => (
                  <ReportRow
                    key={employee.id}
                    index={index + 1}
                    title={employee.name}
                    subtitle={`${employee.position} · ${employee.outlet_name || "No outlet"}`}
                    value={`${employee.total_score}%`}
                    type="warning"
                  />
                ))
              )}
            </div>
          </ReportSection>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ReportSection title="Top Outlets" subtitle="Outlet performance and Hard Rock score">
            <div className="space-y-3">
              {analytics.top_outlets.length === 0 ? (
                <EmptyState text="No outlets found." />
              ) : (
                analytics.top_outlets.map((outlet, index) => (
                  <ReportRow
                    key={outlet.name}
                    index={index + 1}
                    title={outlet.name}
                    subtitle={`${outlet.employees_count} employees · HR Score ${outlet.hard_rock_score}%`}
                    value={`${outlet.score}%`}
                    type="info"
                  />
                ))
              )}
            </div>
          </ReportSection>

          <ReportSection title="Training Activity" subtitle="Session movement">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <ActivityBox
                label="Completed Trainings"
                value={completedSessions.length}
                helper="Sessions already completed"
              />

              <ActivityBox
                label="Scheduled Trainings"
                value={scheduledSessions.length}
                helper="Upcoming sessions"
              />

              <ActivityBox
                label="Total Trainings"
                value={sessions.length}
                helper="All registered sessions"
              />
            </div>
          </ReportSection>
        </section>

        <ReportSection title="Next Training" subtitle="Upcoming training session">
          {dashboard.next_training ? (
            <div className="rounded-[1.5rem] bg-slate-50 p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-blue-100 p-3 text-blue-700">
                  <CalendarClock size={22} />
                </div>

                <div>
                  <h3 className="text-xl font-black text-slate-950">
                    {dashboard.next_training.title}
                  </h3>

                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {dashboard.next_training.topic}
                  </p>

                  <p className="mt-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600">
                    {new Date(
                      dashboard.next_training.start_datetime
                    ).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState text="No upcoming training found." />
          )}
        </ReportSection>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <RoadmapReport title="30 Days" items={dashboard.roadmap_30} />
          <RoadmapReport title="60 Days" items={dashboard.roadmap_60} />
          <RoadmapReport title="90 Days" items={dashboard.roadmap_90} />
        </section>

        <ReportSection title="Executive Notes" subtitle="Recommended leadership focus">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <NoteCard
              title="Service Consistency"
              text="Maintain focus on greeting standards, service speed, product knowledge, and guest recovery."
            />

            <NoteCard
              title="Talent Development"
              text="Recognize top performers and consider them for mentorship, facilitator support, or leadership pipeline."
            />

            <NoteCard
              title="Coaching Follow-up"
              text="Low performers should receive direct observation, coaching plans, and follow-up evaluations within 7 to 14 days."
            />
          </div>
        </ReportSection>
      </div>
    </div>
  );
}

function ReportMetric({
  label,
  value,
  icon,
  score,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  score?: number;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">
            {value}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 print:hidden">
          {icon}
        </div>
      </div>

      {typeof score === "number" && (
        <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${getScoreColor(score)}`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ReportSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6 print:break-inside-avoid">
      <div className="mb-5">
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>

      {children}
    </div>
  );
}

function ReportRow({
  index,
  title,
  subtitle,
  value,
  type,
}: {
  index?: number;
  title: string;
  subtitle: string;
  value: string | number;
  type?: "success" | "warning" | "info";
}) {
  const badgeStyle =
    type === "success"
      ? "bg-emerald-100 text-emerald-700"
      : type === "warning"
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";

  const score =
    typeof value === "string" && value.includes("%")
      ? Number(value.replace("%", ""))
      : null;

  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {index && (
            <div className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-black ${badgeStyle}`}>
              #{index}
            </div>
          )}

          <div>
            <p className="font-black text-slate-950">{title}</p>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
        </div>

        <p className="text-2xl font-black text-slate-950">{value}</p>
      </div>

      {score !== null && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${getScoreColor(score)}`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      )}
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
  const completed = items.filter((item) => item.completed).length;
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0;

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm print:break-inside-avoid">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">
            {completed} of {items.length} completed
          </p>
        </div>

        <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
          {progress}%
        </span>
      </div>

      <div className="mb-5 h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-slate-950"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <EmptyState text="No roadmap items." />
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-[1.25rem] bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-black text-slate-950">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {item.description}
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1 text-xs font-black ${
                    item.completed
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {item.completed ? "DONE" : "OPEN"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function InsightCard({
  type,
  title,
  value,
  description,
}: {
  type: "success" | "warning" | "info";
  title: string;
  value: string;
  description: string;
}) {
  const styles =
    type === "success"
      ? "bg-emerald-50 text-emerald-700"
      : type === "warning"
        ? "bg-amber-50 text-amber-700"
        : "bg-blue-50 text-blue-700";

  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-5">
      <span className={`rounded-full px-3 py-1 text-xs font-black ${styles}`}>
        {title}
      </span>

      <p className="mt-4 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function ActivityBox({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-5">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-sm text-slate-400">{helper}</p>
    </div>
  );
}

function NoteCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-5">
      <p className="font-black text-slate-950">{title}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{text}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
      {text}
    </div>
  );
}

function getScoreColor(score: number) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 80) return "bg-blue-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
}