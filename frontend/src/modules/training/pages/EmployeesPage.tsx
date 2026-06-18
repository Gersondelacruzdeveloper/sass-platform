import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  ImagePlus,
  RefreshCcw,
  Search,
  ShieldAlert,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import api from "../../../api/axios";
import { assignedTrainingsApi } from "../api/trainingRecoveryApi";
import { getEmployeeEvaluations } from "../api/trainingApi";

import type {
  Employee,
  Outlet,
  EmployeeAssignedTraining,
  EmployeeEvaluation,
} from "../types/training";

const initialForm = {
  name: "",
  employee_code: "",
  department: "A&B",
  outlet: "",
  position: "",
  supervisor: "",
  hire_date: "",
  active: true,
  notes: "",
};

export default function EmployeesPage() {
  const { organisationSlug } = useParams();
  const tenantSlug = organisationSlug || "";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [assignedTrainings, setAssignedTrainings] = useState<EmployeeAssignedTraining[]>([]);
  const [evaluations, setEvaluations] = useState<EmployeeEvaluation[]>([]);

  const [form, setForm] = useState(initialForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");

  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [search, setSearch] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [followUpFilter, setFollowUpFilter] = useState("all");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      setLoading(true);

      const [
        employeesRes,
        outletsRes,
        assignedTrainingsRes,
        evaluationsData,
      ] = await Promise.all([
        api.get<Employee[]>("/training/employees/"),
        api.get<Outlet[]>("/training/outlets/"),
        assignedTrainingsApi.list(),
        getEmployeeEvaluations(),
      ]);

      setEmployees(employeesRes.data);
      setOutlets(outletsRes.data);
      setAssignedTrainings(assignedTrainingsRes.data);
      setEvaluations(evaluationsData);
    } catch (error) {
      console.error("Error loading employees:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const employeeStats = useMemo(() => {
    const map = new Map<
      number,
      {
        totalTrainings: number;
        openTrainings: number;
        completedTrainings: number;
        reevaluationPending: number;
        latestEvaluation?: EmployeeEvaluation;
      }
    >();

    employees.forEach((employee) => {
      map.set(employee.id, {
        totalTrainings: 0,
        openTrainings: 0,
        completedTrainings: 0,
        reevaluationPending: 0,
      });
    });

    assignedTrainings.forEach((training) => {
      const current =
        map.get(training.employee) || {
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

    evaluations.forEach((evaluation) => {
      const current =
        map.get(evaluation.employee) || {
          totalTrainings: 0,
          openTrainings: 0,
          completedTrainings: 0,
          reevaluationPending: 0,
        };

      const currentDate = current.latestEvaluation?.created_at
        ? new Date(current.latestEvaluation.created_at).getTime()
        : 0;

      const newDate = evaluation.created_at
        ? new Date(evaluation.created_at).getTime()
        : 0;

      if (!current.latestEvaluation || newDate > currentDate) {
        current.latestEvaluation = evaluation;
      }

      map.set(evaluation.employee, current);
    });

    return map;
  }, [employees, assignedTrainings, evaluations]);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const stats = employeeStats.get(emp.id);

      const searchValue = `
        ${emp.name}
        ${emp.employee_code || ""}
        ${emp.position}
        ${emp.outlet_name || ""}
        ${emp.department || ""}
        ${emp.supervisor_name || ""}
      `.toLowerCase();

      const matchesSearch = searchValue.includes(search.toLowerCase());

      const matchesOutlet =
        outletFilter === "all" || String(emp.outlet) === outletFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && emp.active) ||
        (statusFilter === "inactive" && !emp.active);

      const matchesFollowUp =
        followUpFilter === "all" ||
        (followUpFilter === "open" && Number(stats?.openTrainings || 0) > 0) ||
        (followUpFilter === "reevaluation" &&
          Number(stats?.reevaluationPending || 0) > 0) ||
        (followUpFilter === "clear" && Number(stats?.openTrainings || 0) === 0);

      return matchesSearch && matchesOutlet && matchesStatus && matchesFollowUp;
    });
  }, [
    employees,
    employeeStats,
    search,
    outletFilter,
    statusFilter,
    followUpFilter,
  ]);

  const activeEmployees = employees.filter((e) => e.active).length;

  const employeesWithOpenTraining = employees.filter(
    (employee) => Number(employeeStats.get(employee.id)?.openTrainings || 0) > 0,
  ).length;

  const reevaluationPending = assignedTrainings.filter(
    (item) => item.status === "reevaluation_pending",
  ).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      const formData = new FormData();

      formData.append("name", form.name);
      formData.append("employee_code", form.employee_code);
      formData.append("department", form.department);
      formData.append("position", form.position);
      formData.append("notes", form.notes);
      formData.append("active", form.active ? "true" : "false");

      if (form.outlet) formData.append("outlet", form.outlet);
      if (form.supervisor) formData.append("supervisor", form.supervisor);
      if (form.hire_date) formData.append("hire_date", form.hire_date);

      if (photoFile) {
        formData.append("photo", photoFile);
      }

      if (editingEmployee) {
        await api.patch(`/training/employees/${editingEmployee.id}/`, formData);
      } else {
        await api.post("/training/employees/", formData);
      }

      setForm(initialForm);
      setPhotoFile(null);
      setPhotoPreview("");
      setEditingEmployee(null);

      const input = document.getElementById("employee-photo") as HTMLInputElement | null;
      if (input) input.value = "";

      await loadData();
    } catch (error) {
      console.error("Error saving employee:", error);
      alert("Could not save employee.");
    } finally {
      setSaving(false);
    }
  }

  function handlePhotoChange(file?: File | null) {
    if (!file) {
      setPhotoFile(null);
      setPhotoPreview("");
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function handleEdit(employee: Employee) {
    setEditingEmployee(employee);

    setForm({
      name: employee.name || "",
      employee_code: employee.employee_code || "",
      department: employee.department || "A&B",
      outlet: employee.outlet ? String(employee.outlet) : "",
      position: employee.position || "",
      supervisor: employee.supervisor ? String(employee.supervisor) : "",
      hire_date: employee.hire_date || "",
      active: employee.active ?? true,
      notes: employee.notes || "",
    });

    setPhotoFile(null);
    setPhotoPreview(employee.photo || "");

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(employee: Employee) {
    const confirmed = window.confirm(`Delete ${employee.name}?`);
    if (!confirmed) return;

    try {
      await api.delete(`/training/employees/${employee.id}/`);
      await loadData();
    } catch (error) {
      console.error("Error deleting employee:", error);
      alert("Could not delete employee.");
    }
  }

  function cancelEdit() {
    setEditingEmployee(null);
    setForm(initialForm);
    setPhotoFile(null);
    setPhotoPreview("");

    const input = document.getElementById("employee-photo") as HTMLInputElement | null;
    if (input) input.value = "";
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-40 rounded-[2rem] bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
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
                Centro Operativo de Colaboradores
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Colaboradores A&B
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Gestiona colaboradores por outlet, foto, posición, supervisor,
                evaluaciones y refuerzos pendientes.
              </p>
            </div>

            <button
              onClick={() => {
                cancelEdit();
                window.scrollTo({ top: 260, behavior: "smooth" });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-950 transition hover:bg-slate-100"
            >
              <UserPlus size={18} />
              Nuevo colaborador
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Total colaboradores" value={employees.length} icon={<Users />} />
          <SummaryCard title="Activos" value={activeEmployees} icon={<CheckCircle2 />} />
          <SummaryCard title="Con refuerzo abierto" value={employeesWithOpenTraining} icon={<ShieldAlert />} />
          <SummaryCard title="Re-evaluación pendiente" value={reevaluationPending} icon={<RefreshCcw />} />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                {editingEmployee ? "Actualizar colaborador" : "Crear colaborador"}
              </h2>
              <p className="text-sm text-slate-500">
                Información operativa necesaria para evaluación, seguimiento y microtraining.
              </p>
            </div>

            {editingEmployee && (
              <button
                type="button"
                onClick={cancelEdit}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 font-bold text-slate-700"
              >
                <X size={16} />
                Cancelar edición
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[220px_1fr]">
            <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col items-center text-center">
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Colaborador"
                    className="h-32 w-32 rounded-[2rem] object-cover shadow-sm"
                  />
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-[2rem] bg-slate-950 text-4xl font-black text-white shadow-sm">
                    {form.name?.[0]?.toUpperCase() || "C"}
                  </div>
                )}

                <label className="mt-4 inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100">
                  <ImagePlus size={16} />
                  Subir foto
                  <input
                    id="employee-photo"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handlePhotoChange(e.target.files?.[0])}
                  />
                </label>

                <p className="mt-3 text-xs font-semibold text-slate-400">
                  La foto se guardará en S3 y se mostrará en toda la plataforma.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Input
                label="Nombre"
                required
                value={form.name}
                onChange={(value) => setForm({ ...form, name: value })}
              />

              <Input
                label="Código colaborador"
                value={form.employee_code}
                onChange={(value) => setForm({ ...form, employee_code: value })}
              />

              <Input
                label="Departamento"
                value={form.department}
                onChange={(value) => setForm({ ...form, department: value })}
              />

              <Select
                label="Outlet"
                value={form.outlet}
                onChange={(value) => setForm({ ...form, outlet: value })}
              >
                <option value="">Seleccionar outlet</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={String(outlet.id)}>
                    {outlet.name}
                  </option>
                ))}
              </Select>

              <Input
                label="Posición"
                required
                value={form.position}
                onChange={(value) => setForm({ ...form, position: value })}
              />

              <Select
                label="Supervisor"
                value={form.supervisor}
                onChange={(value) => setForm({ ...form, supervisor: value })}
              >
                <option value="">Seleccionar supervisor</option>
                {employees
                  .filter((emp) => emp.id !== editingEmployee?.id)
                  .map((emp) => (
                    <option key={emp.id} value={String(emp.id)}>
                      {emp.name} — {emp.position}
                    </option>
                  ))}
              </Select>

              <Input
                label="Fecha ingreso"
                type="date"
                value={form.hire_date}
                onChange={(value) => setForm({ ...form, hire_date: value })}
              />

              <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 md:col-span-2">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  className="h-4 w-4 accent-slate-950"
                />
                <span className="font-bold text-slate-700">Colaborador activo</span>
              </label>

              <textarea
                className="md:col-span-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="Notas operativas: actitud, oportunidad observada, comentarios del supervisor..."
                rows={4}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>

          <button
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 disabled:opacity-50 md:w-auto"
          >
            {saving
              ? "Guardando..."
              : editingEmployee
                ? "Actualizar colaborador"
                : "Crear colaborador"}
          </button>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Directorio Operativo
              </h2>
              <p className="text-sm text-slate-500">
                Busca colaboradores y revisa rápidamente si tienen refuerzos o reevaluaciones pendientes.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4 lg:min-w-[760px]">
              <div className="relative md:col-span-2">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="Buscar colaborador..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={outletFilter}
                onChange={(e) => setOutletFilter(e.target.value)}
              >
                <option value="all">Todos los outlets</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={String(outlet.id)}>
                    {outlet.name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={followUpFilter}
                onChange={(e) => setFollowUpFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="open">Con refuerzo abierto</option>
                <option value="reevaluation">Re-evaluación pendiente</option>
                <option value="clear">Sin seguimiento abierto</option>
              </select>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {[
              { value: "all", label: "Todos" },
              { value: "active", label: "Activos" },
              { value: "inactive", label: "Inactivos" },
            ].map((item) => (
              <button
                key={item.value}
                onClick={() => setStatusFilter(item.value)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  statusFilter === item.value
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredEmployees.length} de {employees.length} colaboradores
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">No se encontraron colaboradores.</p>
              <p className="mt-1 text-sm text-slate-500">
                Intenta cambiar la búsqueda o los filtros.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredEmployees.map((emp) => (
                <EmployeeCard
                  key={emp.id}
                  emp={emp}
                  stats={employeeStats.get(emp.id)}
                  tenantSlug={tenantSlug}
                  onEdit={() => handleEdit(emp)}
                  onDelete={() => handleDelete(emp)}
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
  emp,
  stats,
  tenantSlug,
  onEdit,
  onDelete,
}: {
  emp: Employee;
  tenantSlug: string;
  stats?: {
    totalTrainings: number;
    openTrainings: number;
    completedTrainings: number;
    reevaluationPending: number;
    latestEvaluation?: EmployeeEvaluation;
  };
  onEdit: () => void;
  onDelete: () => void;
}) {
  const score = Number(emp.total_score || stats?.latestEvaluation?.final_score || 0);

  const scoreColor =
    score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-red-500";

  const hasOpenFollowUp = Number(stats?.openTrainings || 0) > 0;
  const hasReevaluation = Number(stats?.reevaluationPending || 0) > 0;

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {emp.photo ? (
            <img
              src={emp.photo}
              alt={emp.name}
              className="h-16 w-16 shrink-0 rounded-3xl object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-slate-950 text-xl font-black text-white">
              {emp.name?.[0] || "C"}
            </div>
          )}

          <div className="min-w-0">
            <h3 className="truncate font-black text-slate-950">{emp.name}</h3>
            <p className="truncate text-sm font-medium text-slate-500">{emp.position}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <Building2 size={13} />
              {emp.outlet_name || "Sin outlet"}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            emp.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {emp.active ? "Activo" : "Inactivo"}
        </span>
      </div>

      <div className="mt-5 rounded-3xl bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-500">Score actual</span>
          <span className="text-2xl font-black text-slate-950">{score}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${scoreColor}`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="Refuerzos abiertos" value={stats?.openTrainings || 0} />
        <MiniMetric label="Re-evaluar" value={stats?.reevaluationPending || 0} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {hasOpenFollowUp ? (
          <Pill icon={<ShieldAlert size={13} />} text="En seguimiento" />
        ) : (
          <Pill icon={<BadgeCheck size={13} />} text="Sin refuerzo abierto" green />
        )}

        {hasReevaluation && (
          <Pill icon={<RefreshCcw size={13} />} text="Re-evaluación pendiente" />
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Link
          to={`/training/${tenantSlug}/employees/${emp.id}`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-3 text-sm font-black text-white"
        >
          <Eye size={15} />
          Ver
        </Link>

        <button
          onClick={onEdit}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-700"
        >
          <Edit3 size={15} />
          Editar
        </button>

        <button
          onClick={onDelete}
          className="inline-flex items-center justify-center rounded-2xl bg-red-50 px-3 py-3 text-sm font-black text-red-700"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-400">{label}</p>
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        required={required}
        type={type}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
        placeholder={placeholder || label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function Pill({
  text,
  icon,
  green,
}: {
  text: string;
  icon?: React.ReactNode;
  green?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${
        green ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {icon}
      {text}
    </span>
  );
}