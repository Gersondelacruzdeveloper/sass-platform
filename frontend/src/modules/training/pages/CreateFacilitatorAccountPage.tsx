import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ShieldCheck, UserCheck } from "lucide-react";
import api from "../../../api/axios";
import type { Employee } from "../types/training";

type Outlet = {
  id: number;
  name: string;
};

export default function CreateFacilitatorAccountPage() {
  const navigate = useNavigate();
  const { organisationSlug } = useParams();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);

  const [form, setForm] = useState({
    employee: "",
    username: "",
    email: "",
    password: "",
    assigned_employees: [] as number[],
    assigned_outlets: [] as number[],
    specialties: "",
    can_create_employees: true,
    can_create_trainings: true,
    can_create_evaluations: true,
    can_view_reports: false,
    active: true,
  });

  async function loadData() {
    const [employeesRes, outletsRes] = await Promise.all([
      api.get("/training/employees/"),
      api.get("/training/outlets/"),
    ]);

    setEmployees(employeesRes.data);
    setOutlets(outletsRes.data);
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await api.post("/training/facilitators/create_account/", {
      employee: Number(form.employee),
      username: form.username,
      email: form.email,
      password: form.password,
      assigned_employees: form.assigned_employees,
      assigned_outlets: form.assigned_outlets,
      specialties: splitText(form.specialties),
      can_create_employees: form.can_create_employees,
      can_create_trainings: form.can_create_trainings,
      can_create_evaluations: form.can_create_evaluations,
      can_view_reports: form.can_view_reports,
      active: form.active,
    });

    navigate(`/training/${organisationSlug}/facilitators`);
  }

  function toggleAssignedEmployee(employeeId: number) {
    setForm((prev) => ({
      ...prev,
      assigned_employees: prev.assigned_employees.includes(employeeId)
        ? prev.assigned_employees.filter((id) => id !== employeeId)
        : [...prev.assigned_employees, employeeId],
    }));
  }

  function toggleAssignedOutlet(outletId: number) {
    setForm((prev) => ({
      ...prev,
      assigned_outlets: prev.assigned_outlets.includes(outletId)
        ? prev.assigned_outlets.filter((id) => id !== outletId)
        : [...prev.assigned_outlets, outletId],
    }));
  }

  const availableEmployees = employees.filter(
    (employee) => String(employee.id) !== form.employee,
  );


return (
  <div className="min-h-screen bg-slate-50">
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6 lg:p-8">
      <Link
        to={`/training/${organisationSlug}/facilitators`}
        className="inline-flex items-center gap-2 font-bold text-slate-600 hover:text-slate-950"
      >
        <ArrowLeft size={18} />
        Volver a facilitadores
      </Link>

      <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
          <ShieldCheck size={16} />
          Crear Login de Facilitador
        </div>

        <h1 className="text-3xl font-black tracking-tight md:text-5xl">
          Crear cuenta de facilitador
        </h1>

        <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
          Crea el usuario, asigna empleados, outlets y permisos para que el facilitador pueda trabajar desde su propio login.
        </p>
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-700">
              Empleado facilitador
            </span>

            <select
              required
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              value={form.employee}
              onChange={(e) => setForm({ ...form, employee: e.target.value })}
            >
              <option value="">Seleccionar empleado</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} — {employee.position}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-700">
              Especialidades
            </span>

            <input
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="Vinos, Servicio al Huésped, Venta Sugestiva, Liderazgo"
              value={form.specialties}
              onChange={(e) => setForm({ ...form, specialties: e.target.value })}
            />
          </label>
        </div>

        <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-4 text-lg font-black text-slate-950">
            Cuenta de Login
          </h3>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Input
              label="Usuario"
              value={form.username}
              placeholder="facilitador01"
              onChange={(value) => setForm({ ...form, username: value })}
            />

            <Input
              label="Correo"
              type="email"
              value={form.email}
              placeholder="facilitador@hardrockacademy.com"
              onChange={(value) => setForm({ ...form, email: value })}
            />

            <Input
              label="Contraseña Temporal"
              type="password"
              value={form.password}
              placeholder="HardRock123!"
              onChange={(value) => setForm({ ...form, password: value })}
            />
          </div>
        </div>

        <SelectionBox
          title="Empleados asignados"
          subtitle="Personas que este facilitador va a evaluar y acompañar."
          count={form.assigned_employees.length}
        >
          {availableEmployees.map((employee) => {
            const selected = form.assigned_employees.includes(employee.id);

            return (
              <SelectCard
                key={employee.id}
                selected={selected}
                title={employee.name}
                subtitle={`${employee.position} · ${employee.outlet_name || "Sin outlet"}`}
                onClick={() => toggleAssignedEmployee(employee.id)}
              />
            );
          })}
        </SelectionBox>

        <SelectionBox
          title="Outlets asignados"
          subtitle="Áreas donde este facilitador puede dar seguimiento."
          count={form.assigned_outlets.length}
        >
          {outlets.map((outlet) => {
            const selected = form.assigned_outlets.includes(outlet.id);

            return (
              <SelectCard
                key={outlet.id}
                selected={selected}
                title={outlet.name}
                subtitle="Outlet asignado"
                onClick={() => toggleAssignedOutlet(outlet.id)}
              />
            );
          })}
        </SelectionBox>

        <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-4 text-lg font-black text-slate-950">
            Permisos
          </h3>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PermissionToggle
              label="Puede crear empleados"
              checked={form.can_create_employees}
              onChange={(checked) => setForm({ ...form, can_create_employees: checked })}
            />

            <PermissionToggle
              label="Puede crear entrenamientos"
              checked={form.can_create_trainings}
              onChange={(checked) => setForm({ ...form, can_create_trainings: checked })}
            />

            <PermissionToggle
              label="Puede crear evaluaciones"
              checked={form.can_create_evaluations}
              onChange={(checked) => setForm({ ...form, can_create_evaluations: checked })}
            />

            <PermissionToggle
              label="Puede ver reportes"
              checked={form.can_view_reports}
              onChange={(checked) => setForm({ ...form, can_view_reports: checked })}
            />

            <PermissionToggle
              label="Cuenta activa"
              checked={form.active}
              onChange={(checked) => setForm({ ...form, active: checked })}
            />
          </div>
        </div>

        <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 md:w-auto">
          <UserCheck size={18} />
          Crear Cuenta de Facilitador
        </button>
      </form>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none"
        placeholder={placeholder}
      />
    </label>
  );
}

function SelectionBox({
  title,
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h3 className="font-black text-slate-950">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>

        <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
          {count} seleccionados
        </span>
      </div>

      <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </div>
  );
}

function SelectCard({
  selected,
  title,
  subtitle,
  onClick,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
        selected
          ? "border-slate-950 bg-white shadow-sm"
          : "border-transparent bg-white/70 hover:bg-white"
      }`}
    >
      <div>
        <p className="font-bold text-slate-950">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>

      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full border ${
          selected
            ? "border-slate-950 bg-slate-950 text-white"
            : "border-slate-300 bg-white"
        }`}
      >
        {selected && <CheckCircle2 size={15} />}
      </span>
    </button>
  );
}

function PermissionToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-white px-4 py-3">
      <span className="font-bold text-slate-700">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-slate-950"
      />
    </label>
  );
}

function splitText(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}