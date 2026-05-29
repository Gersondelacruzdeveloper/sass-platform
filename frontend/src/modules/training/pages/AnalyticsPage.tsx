import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Search,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

import { getTrainingAnalytics } from "../api/trainingApi";
import type { TrainingAnalytics } from "../types/training";

export default function AnalyticsPage() {
  const [data, setData] = useState<TrainingAnalytics | null>(null);
  const [employeeSearch, setEmployeeSearch] = useState("");

  useEffect(() => {
    getTrainingAnalytics().then(setData);
  }, []);

  const filteredTopEmployees = useMemo(() => {
    if (!data) return [];

    return data.top_employees.filter((employee) => {
      const value = `
        ${employee.name}
        ${employee.position}
        ${employee.outlet_name || ""}
        ${employee.potential_level || ""}
      `.toLowerCase();

      return value.includes(employeeSearch.toLowerCase());
    });
  }, [data, employeeSearch]);

  const filteredLowPerformers = useMemo(() => {
    if (!data) return [];

    return data.low_performers.filter((employee) => {
      const value = `
        ${employee.name}
        ${employee.position}
        ${employee.outlet_name || ""}
        ${employee.potential_level || ""}
      `.toLowerCase();

      return value.includes(employeeSearch.toLowerCase());
    });
  }, [data, employeeSearch]);

  if (!data) {
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

  const completedRate = data.trainings_total
    ? Math.round((data.completed_trainings / data.trainings_total) * 100)
    : 0;

  const bestOutlet = [...data.top_outlets].sort(
    (a, b) => Number(b.score || 0) - Number(a.score || 0)
  )[0];

  const weakestOutlet = [...data.top_outlets].sort(
    (a, b) => Number(a.score || 0) - Number(b.score || 0)
  )[0];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                <BarChart3 size={16} />
                A&B Executive Analytics
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                A&B Analytics
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Vista ejecutiva de rendimiento, estándares, entrenamientos,
                evaluaciones y talento para tomar decisiones rápido.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:min-w-[420px]">
              <HeroMiniCard
                label="Best Outlet"
                value={bestOutlet?.name || "N/A"}
                helper={`${bestOutlet?.score || 0}%`}
              />

              <HeroMiniCard
                label="Needs Focus"
                value={weakestOutlet?.name || "N/A"}
                helper={`${weakestOutlet?.score || 0}%`}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ExecutiveStat
            title="A&B Performance"
            value={`${data.ab_performance_score}%`}
            icon={<Sparkles />}
            score={data.ab_performance_score}
          />

          <ExecutiveStat
            title="Hard Rock Score"
            value={`${data.hard_rock_score}%`}
            icon={<Trophy />}
            score={data.hard_rock_score}
          />

          <ExecutiveStat
            title="Training Completion"
            value={`${data.training_completion}%`}
            icon={<GraduationCap />}
            score={data.training_completion}
          />

          <ExecutiveStat
            title="Evaluations"
            value={data.evaluations_total}
            icon={<ClipboardCheck />}
          />
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <MiniStat title="Employees" value={data.employees_total} icon={<Users />} />
          <MiniStat title="Facilitators" value={data.facilitators_total} icon={<CheckCircle2 />} />
          <MiniStat
            title="Completed Trainings"
            value={`${data.completed_trainings}/${data.trainings_total}`}
            icon={<GraduationCap />}
            helper={`${completedRate}% completed`}
          />
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5">
            <h2 className="text-2xl font-black text-slate-950">
              Executive Insights
            </h2>
            <p className="text-sm text-slate-500">
              Resumen rápido para gerentes y directores.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <InsightCard
              type="success"
              title="Best outlet"
              value={bestOutlet?.name || "N/A"}
              description={`Current score: ${bestOutlet?.score || 0}%. Use this outlet as a benchmark.`}
            />

            <InsightCard
              type="warning"
              title="Needs coaching"
              value={weakestOutlet?.name || "N/A"}
              description={`Current score: ${weakestOutlet?.score || 0}%. Review training and standards compliance.`}
            />

            <InsightCard
              type="info"
              title="Training completion"
              value={`${completedRate}%`}
              description={`${data.completed_trainings} completed out of ${data.trainings_total} total trainings.`}
            />
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ChartCard
            title="Top Outlets"
            subtitle="Performance score by outlet"
          >
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.top_outlets} barSize={42}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="score" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Hard Rock Standard by Outlet"
            subtitle="Compliance score by outlet"
          >
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data.top_outlets} barSize={42}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="hard_rock_score" radius={[12, 12, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Talent Analytics
              </h2>
              <p className="text-sm text-slate-500">
                Top performers and employees who need coaching.
              </p>
            </div>

            <div className="relative lg:min-w-[360px]">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="Search employee..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <EmployeeList
              title="Top Performers"
              type="top"
              employees={filteredTopEmployees}
            />

            <EmployeeList
              title="Needs Coaching"
              type="coaching"
              employees={filteredLowPerformers}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-5">
        <h2 className="text-2xl font-black text-slate-950">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="rounded-[1.5rem] bg-slate-50 p-4">{children}</div>
    </div>
  );
}

function EmployeeList({
  title,
  employees,
  type,
}: {
  title: string;
  employees: TrainingAnalytics["top_employees"];
  type: "top" | "coaching";
}) {
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <p className="text-sm text-slate-500">
            {employees.length} employees
          </p>
        </div>

        <div
          className={`rounded-2xl p-3 ${
            type === "top"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-700"
          }`}
        >
          {type === "top" ? <Trophy size={22} /> : <AlertTriangle size={22} />}
        </div>
      </div>

      <div className="space-y-3">
        {employees.length === 0 ? (
          <p className="rounded-2xl bg-white p-4 text-sm text-slate-500">
            No employees found.
          </p>
        ) : (
          employees.map((employee, index) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              index={index}
              type={type}
            />
          ))
        )}
      </div>
    </div>
  );
}

function EmployeeRow({
  employee,
  index,
  type,
}: {
  employee: TrainingAnalytics["top_employees"][number];
  index: number;
  type: "top" | "coaching";
}) {
  const score = Number(employee.total_score || 0);

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-black ${
              type === "top"
                ? "bg-slate-950 text-white"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            #{index + 1}
          </div>

          <div>
            <p className="font-black text-slate-950">{employee.name}</p>
            <p className="text-sm text-slate-500">
              {employee.position} · {employee.outlet_name || "No outlet"}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-2xl font-black text-slate-950">{score}%</p>
          <p className="text-xs font-semibold text-slate-500">
            {employee.potential_level}
          </p>
        </div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${getScoreColor(score)}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>
    </div>
  );
}

function ExecutiveStat({
  title,
  value,
  icon,
  score,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  score?: number;
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

      {typeof score === "number" && (
        <div className="mt-5">
          <div className="h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${getScoreColor(score)}`}
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  title,
  value,
  icon,
  helper,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  helper?: string;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {value}
          </p>
          {helper && (
            <p className="mt-1 text-sm font-semibold text-slate-400">
              {helper}
            </p>
          )}
        </div>

        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function InsightCard({
  title,
  value,
  description,
  type,
}: {
  title: string;
  value: string;
  description: string;
  type: "success" | "warning" | "info";
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

function getScoreColor(score: number) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 80) return "bg-blue-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-red-500";
}