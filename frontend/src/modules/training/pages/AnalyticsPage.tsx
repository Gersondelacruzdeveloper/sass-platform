import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { getTrainingAnalytics } from "../api/trainingApi";
import type { TrainingAnalytics } from "../types/training";
import StatCard from "../components/StatCard";

export default function AnalyticsPage() {
  const [data, setData] = useState<TrainingAnalytics | null>(null);

  useEffect(() => {
    getTrainingAnalytics().then(setData);
  }, []);

  if (!data) {
    return <div className="p-6">Loading analytics...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">A&B Analytics</h1>
        <p className="text-gray-500">
          Vista ejecutiva de rendimiento, estándares, entrenamientos y talento.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard title="A&B Performance" value={`${data.ab_performance_score}%`} />
        <StatCard title="Hard Rock Score" value={`${data.hard_rock_score}%`} />
        <StatCard title="Training Completion" value={`${data.training_completion}%`} />
        <StatCard title="Evaluations" value={data.evaluations_total} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Employees" value={data.employees_total} />
        <StatCard title="Facilitators" value={data.facilitators_total} />
        <StatCard
          title="Completed Trainings"
          value={`${data.completed_trainings}/${data.trainings_total}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="Top Outlets">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.top_outlets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="score" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Hard Rock Standard by Outlet">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.top_outlets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Bar dataKey="hard_rock_score" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <EmployeeList
          title="Top Performers"
          employees={data.top_employees}
        />

        <EmployeeList
          title="Needs Coaching"
          employees={data.low_performers}
        />
      </div>
    </div>
  );
}

function ChartCard({
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

function EmployeeList({
  title,
  employees,
}: {
  title: string;
  employees: TrainingAnalytics["top_employees"];
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>

      <div className="space-y-3">
        {employees.length === 0 ? (
          <p className="text-sm text-gray-500">No employees found.</p>
        ) : (
          employees.map((employee, index) => (
            <div
              key={employee.id}
              className="flex items-center justify-between rounded-xl bg-gray-50 p-4"
            >
              <div>
                <p className="font-semibold">
                  #{index + 1} {employee.name}
                </p>
                <p className="text-sm text-gray-500">
                  {employee.position} · {employee.outlet_name || "No outlet"}
                </p>
              </div>

              <div className="text-right">
                <p className="text-2xl font-bold">{employee.total_score}%</p>
                <p className="text-xs text-gray-500">
                  {employee.potential_level}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}