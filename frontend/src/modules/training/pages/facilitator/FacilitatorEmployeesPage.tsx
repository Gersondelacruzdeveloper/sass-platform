import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BadgeCheck,
  CheckCircle2,
  Eye,
  RefreshCcw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

import api from "../../../../api/axios";
import { assignedTrainingsApi } from "../../api/trainingRecoveryApi";
import { getEmployeeEvaluations } from "../../api/trainingApi";

import type {
  Employee,
  EmployeeAssignedTraining,
  EmployeeEvaluation,
} from "../../types/training";

type EmployeeProgress = {
  evaluationsCount: number;
  latestScore: number;
  averageScore: number;
  totalTrainings: number;
  openTrainings: number;
  completedTrainings: number;
  reevaluationPending: number;
};

export default function FacilitatorEmployeesPage() {
  const { organisationSlug } = useParams();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignedTrainings, setAssignedTrainings] = useState<
    EmployeeAssignedTraining[]
  >([]);
  const [evaluations, setEvaluations] = useState<EmployeeEvaluation[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadEmployees() {
    try {
      setLoading(true);

      const [employeesRes, assignedTrainingsRes, evaluationsData] =
        await Promise.all([
          api.get<Employee[]>("/training/employees/"),
          assignedTrainingsApi.list(),
          getEmployeeEvaluations(),
        ]);

      setEmployees(employeesRes.data);
      setAssignedTrainings(assignedTrainingsRes.data);
      setEvaluations(evaluationsData);
    } catch (error) {
      console.error("Error loading assigned employees:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  const progressByEmployee = useMemo(() => {
    const map = new Map<number, EmployeeProgress>();

    employees.forEach((employee) => {
      map.set(employee.id, {
        evaluationsCount: 0,
        latestScore: 0,
        averageScore: 0,
        totalTrainings: 0,
        openTrainings: 0,
        completedTrainings: 0,
        reevaluationPending: 0,
      });
    });

    evaluations.forEach((evaluation) => {
      const current =
        map.get(evaluation.employee) ||
        {
          evaluationsCount: 0,
          latestScore: 0,
          averageScore: 0,
          totalTrainings: 0,
          openTrainings: 0,
          completedTrainings: 0,
          reevaluationPending: 0,
        };

      const employeeEvaluations = evaluations.filter(
        (item) => item.employee === evaluation.employee,
      );

      const scores = employeeEvaluations.map((item) =>
        Number(item.final_score || 0),
      );

      const average =
        scores.length > 0
          ? Math.round(
              scores.reduce((sum, score) => sum + score, 0) / scores.length,
            )
          : 0;

      const latest = employeeEvaluations
        .slice()
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        )[0];

      current.evaluationsCount = employeeEvaluations.length;
      current.averageScore = average;
      current.latestScore = Number(latest?.final_score || 0);

      map.set(evaluation.employee, current);
    });

    assignedTrainings.forEach((training) => {
      const current =
        map.get(training.employee) ||
        {
          evaluationsCount: 0,
          latestScore: 0,
          averageScore: 0,
          totalTrainings: 0,
          openTrainings: 0,
          completedTrainings: 0,
          reevaluationPending: 0,
        };

      current.totalTrainings += 1;

      if (training.status !== "closed") current.openTrainings += 1;
      if (training.status === "closed") current.completedTrainings += 1;
      if (training.status === "reevaluation_pending") {
        current.reevaluationPending += 1;
      }

      map.set(training.employee, current);
    });

    return map;
  }, [employees, evaluations, assignedTrainings]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((employee) => {
      const progress = progressByEmployee.get(employee.id);

      const value = `
        ${employee.name}
        ${employee.position}
        ${employee.outlet_name || ""}
        ${employee.department || ""}
        ${progress?.openTrainings || 0}
        ${progress?.reevaluationPending || 0}
      `.toLowerCase();

      return value.includes(search.toLowerCase());
    });
  }, [employees, search, progressByEmployee]);

  const activeCount = employees.filter((employee) => employee.active).length;

  const employeesWithOpenTraining = employees.filter(
    (employee) =>
      Number(progressByEmployee.get(employee.id)?.openTrainings || 0) > 0,
  ).length;

  const reevaluationPendingCount = assignedTrainings.filter(
    (training) => training.status === "reevaluation_pending",
  ).length;

  const averageScore = useMemo(() => {
    const scores = employees
      .map((employee) => {
        const progress = progressByEmployee.get(employee.id);
        return Number(progress?.averageScore || employee.total_score || 0);
      })
      .filter((score) => score > 0);

    if (!scores.length) return 0;

    return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
  }, [employees, progressByEmployee]);

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
                Espacio del Facilitador
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Colaboradores Asignados
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Revisa tus colaboradores, su progreso, evaluaciones, refuerzos
                pendientes y reevaluaciones en operación.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 lg:min-w-72">
              <p className="text-sm font-semibold text-white/60">
                Colaboradores Asignados
              </p>
              <p className="mt-2 text-5xl font-black">{employees.length}</p>
              <p className="mt-1 text-sm text-white/60">
                bajo seguimiento
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Activos" value={activeCount} icon={<BadgeCheck />} />

          <SummaryCard
            title="Score Promedio"
            value={`${averageScore}%`}
            icon={<TrendingUp />}
          />

          <SummaryCard
            title="Con Refuerzo"
            value={employeesWithOpenTraining}
            icon={<ShieldAlert />}
          />

          <SummaryCard
            title="Re-evaluar"
            value={reevaluationPendingCount}
            icon={<RefreshCcw />}
          />
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Lista de Colaboradores
              </h2>
              <p className="text-sm text-slate-500">
                Busca por nombre, posición, outlet o estado de seguimiento.
              </p>
            </div>

            <div className="relative lg:min-w-[360px]">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />

              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="Buscar colaborador..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredEmployees.length} de {employees.length} colaboradores
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="font-black text-slate-950">
                No se encontraron colaboradores.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Intenta con otra búsqueda.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredEmployees.map((employee) => (
                <EmployeeCard
                  key={employee.id}
                  employee={employee}
                  progress={progressByEmployee.get(employee.id)}
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
  progress,
  profileUrl,
}: {
  employee: Employee;
  progress?: EmployeeProgress;
  profileUrl: string;
}) {
  const score = Number(
    progress?.averageScore || progress?.latestScore || employee.total_score || 0,
  );

  const scoreColor =
    score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-red-500";

  const openTrainings = Number(progress?.openTrainings || 0);
  const completedTrainings = Number(progress?.completedTrainings || 0);
  const totalTrainings = Number(progress?.totalTrainings || 0);
  const reevaluationPending = Number(progress?.reevaluationPending || 0);

  const completion =
    totalTrainings > 0
      ? Math.round((completedTrainings / totalTrainings) * 100)
      : 0;

  const status =
    reevaluationPending > 0
      ? "Re-evaluación pendiente"
      : openTrainings > 0
        ? "En seguimiento"
        : "Sin refuerzo abierto";

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
            {employee.outlet_name || "Sin outlet"}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            employee.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {employee.active ? "ACTIVO" : "INACTIVO"}
        </span>
      </div>

      <div className="mt-5 rounded-3xl bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Progreso general
          </p>

          <p className="text-lg font-black text-slate-950">{score}%</p>
        </div>

        <div className="h-2 rounded-full bg-slate-100">
          <div
            className={`h-2 rounded-full ${scoreColor}`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>

        <p className="mt-2 text-xs font-semibold text-slate-400">
          {progress?.evaluationsCount || 0} evaluaciones registradas
        </p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniMetric label="Abiertos" value={openTrainings} icon={<ShieldAlert size={14} />} />
        <MiniMetric label="Cerrados" value={completedTrainings} icon={<CheckCircle2 size={14} />} />
        <MiniMetric label="Re-evaluar" value={reevaluationPending} icon={<RefreshCcw size={14} />} />
      </div>

      <div className="mt-4 rounded-3xl bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Microtraining
          </p>
          <p className="text-sm font-black text-slate-950">{completion}%</p>
        </div>

        <div className="h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-slate-950"
            style={{ width: `${Math.min(completion, 100)}%` }}
          />
        </div>

        <p className="mt-2 text-xs font-semibold text-slate-500">
          {completedTrainings} de {totalTrainings} refuerzos completados
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            reevaluationPending > 0
              ? "bg-amber-100 text-amber-700"
              : openTrainings > 0
                ? "bg-orange-100 text-orange-700"
                : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {status}
        </span>

        {progress?.latestScore ? (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
            Última evaluación: {progress.latestScore}%
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            Sin evaluación
          </span>
        )}
      </div>

      <Link
        to={profileUrl}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
      >
        <Eye size={16} />
        Ver Perfil
      </Link>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-black text-slate-400">{label}</p>
        <span className="text-slate-400">{icon}</span>
      </div>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
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