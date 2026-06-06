import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BadgeCheck,
  Eye,
  Search,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

import api from "../../../../api/axios";
import type { Employee } from "../../types/training";

export default function FacilitatorEmployeesPage() {
  const { organisationSlug } = useParams();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadEmployees() {
    try {
      setLoading(true);
      const response = await api.get("/training/employees/");
      setEmployees(response.data);
    } catch (error) {
      console.error("Error loading assigned employees:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const value = `
        ${employee.name}
        ${employee.position}
        ${employee.outlet_name || ""}
        ${employee.potential_level || ""}
      `.toLowerCase();

      return value.includes(search.toLowerCase());
    });
  }, [employees, search]);

  const averageScore = useMemo(() => {
    if (!employees.length) return 0;

    const total = employees.reduce(
      (sum, employee) => sum + Number(employee.total_score || 0),
      0,
    );

    return Math.round(total / employees.length);
  }, [employees]);

  const promotionReadyCount = employees.filter(
    (employee) => employee.promotion_ready,
  ).length;

  const activeCount = employees.filter((employee) => employee.active).length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-44 rounded-[2rem] bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((item) => (
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
                <Users size={16} />
                Facilitator Workspace
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                My Assigned Employees
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Review your assigned team, follow their progress, and open each
                profile to evaluate or coach them.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 lg:min-w-72">
              <p className="text-sm font-semibold text-white/60">
                Assigned Employees
              </p>
              <p className="mt-2 text-5xl font-black">{employees.length}</p>
              <p className="mt-1 text-sm text-white/60">
                under your follow-up
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Active"
            value={activeCount}
            icon={<BadgeCheck />}
          />

          <SummaryCard
            title="Average Score"
            value={`${averageScore}%`}
            icon={<TrendingUp />}
          />

          <SummaryCard
            title="Promotion Ready"
            value={promotionReadyCount}
            icon={<Sparkles />}
          />
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Employee List
              </h2>
              <p className="text-sm text-slate-500">
                Search by name, position, outlet, or potential level.
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Showing {filteredEmployees.length} of {employees.length} employees
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="font-black text-slate-950">No employees found.</p>
              <p className="mt-1 text-sm text-slate-500">
                Try another search term.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredEmployees.map((employee) => (
                <EmployeeCard
                  key={employee.id}
                  employee={employee}
                  profileUrl={`/training/${organisationSlug}/employees/${employee.id}`}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EmployeeCard({
  employee,
  profileUrl,
}: {
  employee: Employee;
  profileUrl: string;
}) {
  const totalScore = Number(employee.total_score || 0);

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md">
      <div className="flex items-start gap-4">
        {employee.photo ? (
          <img
            src={employee.photo}
            alt={employee.name}
            className="h-16 w-16 rounded-2xl object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-2xl font-black text-white">
            {employee.name?.charAt(0)?.toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-black text-slate-950">
            {employee.name}
          </h3>

          <p className="truncate text-sm font-semibold text-slate-500">
            {employee.position}
          </p>

          <p className="mt-1 truncate text-xs font-semibold text-slate-400">
            {employee.outlet_name || "No outlet"}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            employee.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {employee.active ? "ACTIVE" : "INACTIVE"}
        </span>
      </div>

      <div className="mt-5 rounded-3xl bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Total Score
          </p>

          <p className="text-lg font-black text-slate-950">
            {totalScore}%
          </p>
        </div>

        <div className="h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-slate-950"
            style={{ width: `${Math.min(totalScore, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize text-slate-600">
          {employee.potential_level?.replace("_", " ") || "No potential"}
        </span>

        {employee.promotion_ready && (
          <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700">
            Promotion Ready
          </span>
        )}
      </div>

      <Link
        to={profileUrl}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
      >
        <Eye size={16} />
        View Profile
      </Link>
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