import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import api from "../../../api/axios";
import type { Employee, Outlet } from "../types/training";
import type { RootState } from "../../../store/store";
import { useSelector } from "react-redux";

const initialForm = {
  name: "",
  employee_code: "",
  department: "A&B",
  outlet: "",
  position: "",
  supervisor: "",
  hire_date: "",
  career_goal: "",
  languages: "",
  strengths: "",
  weaknesses: "",
  service_score: 0,
  leadership_score: 0,
  attitude_score: 0,
  upselling_score: 0,
  hard_rock_standard_score: 0,
  potential_level: "medium",
  promotion_ready: false,
  active: true,
  notes: "",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");
  const [outletFilter, setOutletFilter] = useState("all");
  const [potentialFilter, setPotentialFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);



  async function loadData() {
    try {
      setLoading(true);

      const [employeesRes, outletsRes] = await Promise.all([
        api.get("/training/employees/"),
        api.get("/training/outlets/"),
      ]);

      setEmployees(employeesRes.data);
      setOutlets(outletsRes.data);
    } catch (error) {
      console.error("Error loading employees:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      const searchValue = `
        ${emp.name}
        ${emp.employee_code || ""}
        ${emp.position}
        ${emp.outlet_name || ""}
        ${emp.department || ""}
        ${emp.potential_level || ""}
        ${emp.languages?.join(" ") || ""}
      `.toLowerCase();

      const matchesSearch = searchValue.includes(search.toLowerCase());

      const matchesOutlet =
        outletFilter === "all" || String(emp.outlet) === outletFilter;

      const matchesPotential =
        potentialFilter === "all" || emp.potential_level === potentialFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && emp.active) ||
        (statusFilter === "inactive" && !emp.active) ||
        (statusFilter === "promotion_ready" && emp.promotion_ready);

      return matchesSearch && matchesOutlet && matchesPotential && matchesStatus;
    });
  }, [employees, search, outletFilter, potentialFilter, statusFilter]);

  const activeEmployees = employees.filter((e) => e.active).length;
  const promotionReady = employees.filter((e) => e.promotion_ready).length;

  const user = useSelector((state: RootState) => state.auth.user);
  const tenantSlug = user?.organisation?.slug ? `${user.organisation.slug}/` : "";
  console.log("Tenant slug:", tenantSlug);
  // const futureLeaders = employees.filter(
  //   (e) => e.potential_level === "future_leader"
  // ).length;
  const avgScore = getAverage(employees.map((e) => e.total_score));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const payload = {
      ...form,
      outlet: form.outlet ? Number(form.outlet) : null,
      supervisor: form.supervisor ? Number(form.supervisor) : null,
      hire_date: form.hire_date || null,
      languages: splitText(form.languages),
      strengths: splitText(form.strengths),
      weaknesses: splitText(form.weaknesses),
      service_score: Number(form.service_score),
      leadership_score: Number(form.leadership_score),
      attitude_score: Number(form.attitude_score),
      upselling_score: Number(form.upselling_score),
      hard_rock_standard_score: Number(form.hard_rock_standard_score),
    };

    try {
      setSaving(true);

      if (editingEmployee) {
        await api.patch(`/training/${tenantSlug}employees/${editingEmployee.id}/`, payload);
      } else {
       await api.post("/training/employees/", payload);
      }

      setForm(initialForm);
      setEditingEmployee(null);
      await loadData();
    } catch (error) {
      console.error("Error saving employee:", error);
      alert("Could not save employee.");
    } finally {
      setSaving(false);
    }
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
      career_goal: employee.career_goal || "",
      languages: employee.languages?.join(", ") || "",
      strengths: employee.strengths?.join(", ") || "",
      weaknesses: employee.weaknesses?.join(", ") || "",
      service_score: employee.service_score || 0,
      leadership_score: employee.leadership_score || 0,
      attitude_score: employee.attitude_score || 0,
      upselling_score: employee.upselling_score || 0,
      hard_rock_standard_score: employee.hard_rock_standard_score || 0,
      potential_level: employee.potential_level || "medium",
      promotion_ready: employee.promotion_ready || false,
      active: employee.active ?? true,
      notes: employee.notes || "",
    });

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
                Employee Talent Center
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Empleados A&B
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Crea perfiles, evalúa desempeño, identifica talento y da seguimiento rápido a empleados por outlet, potencial y estado.
              </p>
            </div>

            <button
              onClick={() => {
                setEditingEmployee(null);
                setForm(initialForm);
                window.scrollTo({ top: 260, behavior: "smooth" });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-black text-slate-950 transition hover:bg-slate-100"
            >
              <UserPlus size={18} />
              Nuevo empleado
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Total empleados" value={employees.length} icon={<Users />} />
          <SummaryCard title="Activos" value={activeEmployees} icon={<CheckCircle2 />} />
          <SummaryCard title="Promotion ready" value={promotionReady} icon={<BadgeCheck />} />
          <SummaryCard title="Score promedio" value={`${avgScore}%`} icon={<Sparkles />} />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                {editingEmployee ? "Actualizar empleado" : "Crear empleado"}
              </h2>
              <p className="text-sm text-slate-500">
                Perfil, scores, fortalezas, oportunidades y potencial.
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

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Nombre" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
            <Input label="Código empleado" value={form.employee_code} onChange={(value) => setForm({ ...form, employee_code: value })} />
            <Input label="Departamento" value={form.department} onChange={(value) => setForm({ ...form, department: value })} />

            <Select label="Outlet" value={form.outlet} onChange={(value) => setForm({ ...form, outlet: value })}>
              <option value="">Seleccionar outlet</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </Select>

            <Input label="Posición" required value={form.position} onChange={(value) => setForm({ ...form, position: value })} />

            <Select label="Supervisor" value={form.supervisor} onChange={(value) => setForm({ ...form, supervisor: value })}>
              <option value="">Seleccionar supervisor</option>
              {employees
                .filter((emp) => emp.id !== editingEmployee?.id)
                .map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} — {emp.position}
                  </option>
                ))}
            </Select>

            <Input label="Fecha ingreso" type="date" value={form.hire_date} onChange={(value) => setForm({ ...form, hire_date: value })} />
            <Input label="Meta profesional" value={form.career_goal} onChange={(value) => setForm({ ...form, career_goal: value })} />

            <Select label="Nivel de potencial" value={form.potential_level} onChange={(value) => setForm({ ...form, potential_level: value })}>
              <option value="low">Low Potential</option>
              <option value="medium">Medium Potential</option>
              <option value="high">High Potential</option>
              <option value="future_leader">Future Leader</option>
            </Select>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Idiomas" value={form.languages} onChange={(value) => setForm({ ...form, languages: value })} placeholder="Spanish, English, French" />
            <Input label="Fortalezas" value={form.strengths} onChange={(value) => setForm({ ...form, strengths: value })} placeholder="Smile, speed, leadership" />
            <Input label="Debilidades" value={form.weaknesses} onChange={(value) => setForm({ ...form, weaknesses: value })} placeholder="Upselling, menu knowledge" />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-5">
            <ScoreInput label="Service" value={form.service_score} onChange={(value) => setForm({ ...form, service_score: value })} />
            <ScoreInput label="Leadership" value={form.leadership_score} onChange={(value) => setForm({ ...form, leadership_score: value })} />
            <ScoreInput label="Attitude" value={form.attitude_score} onChange={(value) => setForm({ ...form, attitude_score: value })} />
            <ScoreInput label="Upselling" value={form.upselling_score} onChange={(value) => setForm({ ...form, upselling_score: value })} />
            <ScoreInput label="HR Standard" value={form.hard_rock_standard_score} onChange={(value) => setForm({ ...form, hard_rock_standard_score: value })} />
          </div>

          <textarea
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="Notas: actitud, oportunidades, comentarios del manager..."
            rows={4}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <ToggleLabel
              label="Promotion ready"
              checked={form.promotion_ready}
              onChange={(checked) => setForm({ ...form, promotion_ready: checked })}
            />

            <ToggleLabel
              label="Activo"
              checked={form.active}
              onChange={(checked) => setForm({ ...form, active: checked })}
            />
          </div>

          <button
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 disabled:opacity-50 md:w-auto"
          >
            {saving ? "Guardando..." : editingEmployee ? "Actualizar empleado" : "Crear empleado"}
          </button>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">Directorio de empleados</h2>
              <p className="text-sm text-slate-500">
                Busca por nombre, código, posición, outlet, idioma o potencial.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4 lg:min-w-[760px]">
              <div className="relative md:col-span-2">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="Search employee..."
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
                  <option key={outlet.id} value={outlet.id}>
                    {outlet.name}
                  </option>
                ))}
              </select>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">Todos</option>
                <option value="active">Activos</option>
                <option value="inactive">Inactivos</option>
                <option value="promotion_ready">Promotion ready</option>
              </select>
            </div>
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {["all", "low", "medium", "high", "future_leader"].map((level) => (
              <button
                key={level}
                onClick={() => setPotentialFilter(level)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  potentialFilter === level
                    ? "bg-slate-950 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {level === "all" ? "Todos" : level.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredEmployees.length} de {employees.length} empleados
          </div>

          {filteredEmployees.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">No employees found.</p>
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
  tenantSlug,
  onEdit,
  onDelete,
}: {
  emp: Employee;
  tenantSlug: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const score = Number(emp.total_score || 0);
  const scoreColor =
    score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {emp.photo ? (
            <img src={emp.photo} className="h-16 w-16 rounded-3xl object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-950 text-xl font-black text-white">
              {emp.name?.[0] || "E"}
            </div>
          )}

          <div>
            <h3 className="font-black text-slate-950">{emp.name}</h3>
            <p className="text-sm font-medium text-slate-500">{emp.position}</p>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <Building2 size={13} />
              {emp.outlet_name || "No outlet"}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            emp.active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {emp.active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-5 rounded-3xl bg-slate-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-500">Total Score</span>
          <span className="text-2xl font-black text-slate-950">{score}%</span>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full ${scoreColor}`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Pill icon={<BriefcaseBusiness size={13} />} text={emp.potential_level?.replace("_", " ") || "medium"} />

        {emp.promotion_ready && (
          <Pill icon={<BadgeCheck size={13} />} text="Promotion ready" green />
        )}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <Link
          to={`/training/${tenantSlug}/employees/${emp.id}`}

          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-3 py-3 text-sm font-black text-white"
        >
          <Eye size={15} />
          View
        </Link>

        <button
          onClick={onEdit}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-3 py-3 text-sm font-black text-slate-700"
        >
          <Edit3 size={15} />
          Edit
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

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-2 flex justify-between">
        <label className="text-sm font-bold text-slate-700">{label}</label>
        <span className="text-sm font-black text-slate-950">{value}/100</span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-slate-950"
      />
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

function ToggleLabel({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-slate-950"
      />
      <span className="font-bold text-slate-700">{label}</span>
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

function splitText(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAverage(values: number[]) {
  const cleanValues = values.filter((value) => value > 0);

  if (!cleanValues.length) return 0;

  const total = cleanValues.reduce((sum, value) => sum + value, 0);

  return Math.round(total / cleanValues.length);
}