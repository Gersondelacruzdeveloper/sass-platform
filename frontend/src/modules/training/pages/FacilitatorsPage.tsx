import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardList,
  Edit,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import api from "../../../api/axios";
import type { Employee } from "../types/training";

type Facilitator = {
  id: number;
  employee: number;
  employee_name: string;
  assigned_employees: number[];
  assigned_outlets?: number[];
  specialties?: string[];
  active: boolean;
};

export default function FacilitatorsPage() {
  const { organisationSlug } = useParams();

  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  async function loadData() {
    const [facilitatorsRes, employeesRes] = await Promise.all([
      api.get("/training/facilitators/"),
      api.get("/training/employees/"),
    ]);

    setFacilitators(facilitatorsRes.data);
    setEmployees(employeesRes.data);
  }

  useEffect(() => {
    loadData();
  }, []);

  function getEmployeeName(id: number) {
    return employees.find((employee) => employee.id === id)?.name || `Empleado #${id}`;
  }

  async function toggleActive(facilitator: Facilitator) {
    await api.patch(`/training/facilitators/${facilitator.id}/`, {
      active: !facilitator.active,
    });

    loadData();
  }

  const filteredFacilitators = useMemo(() => {
    return facilitators.filter((facilitator) => {
      const assignedNames = facilitator.assigned_employees
        ?.map((id) => getEmployeeName(id))
        .join(" ");

      const searchableText = `
        ${facilitator.employee_name}
        ${facilitator.specialties?.join(" ") || ""}
        ${assignedNames || ""}
      `.toLowerCase();

      const matchesSearch = searchableText.includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && facilitator.active) ||
        (statusFilter === "inactive" && !facilitator.active);

      return matchesSearch && matchesStatus;
    });
  }, [facilitators, search, statusFilter, employees]);

  const activeFacilitators = facilitators.filter((item) => item.active).length;

  const totalAssigned = facilitators.reduce(
    (total, item) => total + (item.assigned_employees?.length || 0),
    0,
  );

  const avgAssigned = facilitators.length
    ? Math.round(totalAssigned / facilitators.length)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                <ShieldCheck size={16} />
                Facilitator Control Center
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Facilitadores internos
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Vista general de facilitadores, cobertura asignada, estado y edición rápida.
              </p>
            </div>

            <Link
              to={`/training/${organisationSlug}/facilitators/create-account`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 font-black text-slate-950 transition hover:bg-slate-100"
            >
              <Plus size={18} />
              Create Facilitator Account
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Facilitadores totales" value={facilitators.length} icon={<Users />} />
          <SummaryCard title="Activos" value={activeFacilitators} icon={<CheckCircle2 />} />
          <SummaryCard title="Personas asignadas" value={totalAssigned} icon={<ClipboardList />} />
          <SummaryCard title="Promedio por facilitador" value={avgAssigned} icon={<Sparkles />} />
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Lista de facilitadores
              </h2>
              <p className="text-sm text-slate-500">
                Busca por facilitador, especialidad o empleado asignado.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:min-w-[520px]">
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />

                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="Search facilitator..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredFacilitators.length} de {facilitators.length} facilitadores
          </div>

          {filteredFacilitators.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">No facilitators found.</p>
              <p className="mt-1 text-sm text-slate-500">
                Intenta cambiar la búsqueda o el filtro.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredFacilitators.map((facilitator) => (
                <FacilitatorCard
                  key={facilitator.id}
                  facilitator={facilitator}
                  getEmployeeName={getEmployeeName}
                  onToggleActive={() => toggleActive(facilitator)}
                  editUrl={`/training/${organisationSlug}/facilitators/${facilitator.id}/edit`}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function FacilitatorCard({
  facilitator,
  getEmployeeName,
  onToggleActive,
  editUrl,
}: {
  facilitator: Facilitator;
  getEmployeeName: (id: number) => string;
  onToggleActive: () => void;
  editUrl: string;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-950">
            {facilitator.employee_name}
          </h3>

          <p className="mt-1 text-sm font-medium text-slate-500">
            {facilitator.assigned_employees?.length || 0} empleados asignados
          </p>
        </div>

        <button
          onClick={onToggleActive}
          className={`rounded-full px-3 py-1 text-xs font-black ${
            facilitator.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {facilitator.active ? "ACTIVE" : "INACTIVE"}
        </button>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-black text-slate-700">Specialties</p>

        <div className="flex flex-wrap gap-2">
          {facilitator.specialties?.length ? (
            facilitator.specialties.map((item) => (
              <span
                key={item}
                className="rounded-full bg-violet-100 px-3 py-1 text-xs font-black text-violet-700"
              >
                {item}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">No specialties yet.</span>
          )}
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-sm font-black text-slate-700">Equipo asignado</p>

        <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto">
          {facilitator.assigned_employees?.length ? (
            facilitator.assigned_employees.map((employeeId) => (
              <span
                key={employeeId}
                className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 shadow-sm"
              >
                {getEmployeeName(employeeId)}
              </span>
            ))
          ) : (
            <span className="text-sm text-slate-500">
              No hay empleados asignados.
            </span>
          )}
        </div>
      </div>

      <Link
        to={editUrl}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white transition hover:bg-slate-800"
      >
        <Edit size={17} />
        Edit
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