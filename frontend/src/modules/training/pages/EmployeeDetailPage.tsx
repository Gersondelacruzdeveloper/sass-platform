import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getEmployee } from "../api/trainingApi";
import type { Employee } from "../types/training";

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const [employee, setEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (id) getEmployee(Number(id)).then(setEmployee);
  }, [id]);

  if (!employee) return <div className="p-6">Loading employee profile...</div>;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="mb-6">
        <Link
          to="/training/employees"
          className="text-sm font-semibold text-gray-500 hover:text-black"
        >
          ← Back to Employees
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="bg-gradient-to-r from-black via-zinc-900 to-zinc-700 p-8 text-white">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              {employee.photo ? (
                <img
                  src={employee.photo}
                  className="h-28 w-28 rounded-3xl border-4 border-white/20 object-cover"
                />
              ) : (
                <div className="flex h-28 w-28 items-center justify-center rounded-3xl bg-white/10 text-5xl font-bold">
                  {employee.name[0]}
                </div>
              )}

              <div>
                <h1 className="text-4xl font-bold">{employee.name}</h1>
                <p className="mt-1 text-white/70">
                  {employee.position} · {employee.outlet_name || "No outlet"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{employee.potential_level.replace("_", " ")}</Badge>
                  {employee.promotion_ready && <Badge>Promotion Ready</Badge>}
                  <Badge>{employee.active ? "Active" : "Inactive"}</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white/10 p-6 text-center backdrop-blur">
              <p className="text-sm text-white/60">Total Score</p>
              <p className="text-5xl font-bold">{employee.total_score}%</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <ScoreCard title="Service" value={employee.service_score} />
              <ScoreCard title="Leadership" value={employee.leadership_score} />
              <ScoreCard title="Attitude" value={employee.attitude_score} />
              <ScoreCard title="Upselling" value={employee.upselling_score} />
              <ScoreCard title="HR Standard" value={employee.hard_rock_standard_score} />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <InfoCard title="Strengths" items={employee.strengths} positive />
              <InfoCard title="Weaknesses" items={employee.weaknesses} />
            </div>

            <Section title="Manager Notes">
              <p className="text-gray-600">
                {employee.notes || "No notes added yet."}
              </p>
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Profile Details">
              <Detail label="Employee Code" value={employee.employee_code || "N/A"} />
              <Detail label="Department" value={employee.department} />
              <Detail label="Supervisor" value={employee.supervisor_name || "No supervisor"} />
              <Detail label="Hire Date" value={employee.hire_date || "No hire date"} />
              <Detail label="Career Goal" value={employee.career_goal || "No career goal"} />
            </Section>

            <Section title="Languages">
              <div className="flex flex-wrap gap-2">
                {employee.languages?.length ? (
                  employee.languages.map((lang) => (
                    <span
                      key={lang}
                      className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700"
                    >
                      {lang}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No languages added.</p>
                )}
              </div>
            </Section>

            <Section title="Growth Recommendation">
              <p className="text-sm text-gray-600">
                {employee.total_score >= 85
                  ? "Strong candidate for recognition, mentorship, or future leadership."
                  : employee.total_score >= 70
                    ? "Good performance. Keep developing consistency and standards."
                    : "Needs coaching plan, observation, and follow-up evaluation."}
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase text-white">
      {children}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b py-3 last:border-b-0">
      <p className="text-xs font-semibold uppercase text-gray-400">{label}</p>
      <p className="mt-1 font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function ScoreCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-2xl font-bold">{value}%</p>

      <div className="mt-3 h-2 rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-black"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function InfoCard({
  title,
  items,
  positive,
}: {
  title: string;
  items: string[];
  positive?: boolean;
}) {
  return (
    <div className="rounded-3xl border bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>

      <div className="flex flex-wrap gap-2">
        {items?.length ? (
          items.map((item) => (
            <span
              key={item}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                positive
                  ? "bg-green-50 text-green-700"
                  : "bg-orange-50 text-orange-700"
              }`}
            >
              {item}
            </span>
          ))
        ) : (
          <p className="text-sm text-gray-500">No items added yet.</p>
        )}
      </div>
    </div>
  );
}