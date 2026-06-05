import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Save, ShieldCheck } from "lucide-react";
import api from "../../../api/axios";
import type { Employee } from "../types/training";

type Outlet = {
  id: number;
  name: string;
};

type Facilitator = {
  id: number;
  employee: number;
  employee_name: string;
  assigned_employees: number[];
  assigned_outlets: number[];
  specialties?: string[];
  active: boolean;
  can_create_employees?: boolean;
  can_create_trainings?: boolean;
  can_create_evaluations?: boolean;
  can_view_reports?: boolean;
};

export default function EditFacilitatorPage() {
  const navigate = useNavigate();
  const { organisationSlug, id } = useParams();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    assigned_employees: [] as number[],
    assigned_outlets: [] as number[],
    specialties: "",
    can_create_employees: true,
    can_create_trainings: true,
    can_create_evaluations: true,
    can_view_reports: false,
    active: true,
  });

  const [facilitatorName, setFacilitatorName] = useState("");

  async function loadData() {
    const [facilitatorRes, employeesRes, outletsRes] = await Promise.all([
      api.get(`/training/facilitators/${id}/`),
      api.get("/training/employees/"),
      api.get("/training/outlets/"),
    ]);

    const facilitator: Facilitator = facilitatorRes.data;

    setFacilitatorName(facilitator.employee_name);
    setEmployees(employeesRes.data);
    setOutlets(outletsRes.data);

    setForm({
      assigned_employees: facilitator.assigned_employees || [],
      assigned_outlets: facilitator.assigned_outlets || [],
      specialties: facilitator.specialties?.join(", ") || "",
      can_create_employees: facilitator.can_create_employees ?? true,
      can_create_trainings: facilitator.can_create_trainings ?? true,
      can_create_evaluations: facilitator.can_create_evaluations ?? true,
      can_view_reports: facilitator.can_view_reports ?? false,
      active: facilitator.active,
    });

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await api.patch(`/training/facilitators/${id}/`, {
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
        ? prev.assigned_employees.filter((item) => item !== employeeId)
        : [...prev.assigned_employees, employeeId],
    }));
  }

  function toggleAssignedOutlet(outletId: number) {
    setForm((prev) => ({
      ...prev,
      assigned_outlets: prev.assigned_outlets.includes(outletId)
        ? prev.assigned_outlets.filter((item) => item !== outletId)
        : [...prev.assigned_outlets, outletId],
    }));
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="rounded-3xl bg-white p-6 font-black text-slate-950 shadow-sm">
          Loading facilitator...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6 lg:p-8">
        <Link
          to={`/training/${organisationSlug}/facilitators`}
          className="inline-flex items-center gap-2 font-bold text-slate-600 hover:text-slate-950"
        >
          <ArrowLeft size={18} />
          Back to facilitators
        </Link>

        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
            <ShieldCheck size={16} />
            Edit Facilitator
          </div>

          <h1 className="text-3xl font-black tracking-tight md:text-5xl">
            {facilitatorName}
          </h1>

          <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
            Actualiza asignaciones, permisos, especialidades y estado del facilitador.
          </p>
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <label className="space-y-2">
            <span className="text-sm font-bold text-slate-700">
              Especialidades
            </span>

            <input
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              placeholder="Wine, Guest Service, Upselling, Leadership"
              value={form.specialties}
              onChange={(e) => setForm({ ...form, specialties: e.target.value })}
            />
          </label>

          <SelectionBox
            title="Empleados asignados"
            subtitle="Actualiza las personas bajo seguimiento."
            count={form.assigned_employees.length}
          >
            {employees.map((employee) => {
              const selected = form.assigned_employees.includes(employee.id);

              return (
                <SelectCard
                  key={employee.id}
                  selected={selected}
                  title={employee.name}
                  subtitle={`${employee.position} · ${employee.outlet_name || "No outlet"}`}
                  onClick={() => toggleAssignedEmployee(employee.id)}
                />
              );
            })}
          </SelectionBox>

          <SelectionBox
            title="Outlets asignados"
            subtitle="Actualiza los outlets donde puede trabajar."
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
              Permissions
            </h3>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <PermissionToggle
                label="Can create employees"
                checked={form.can_create_employees}
                onChange={(checked) => setForm({ ...form, can_create_employees: checked })}
              />

              <PermissionToggle
                label="Can create trainings"
                checked={form.can_create_trainings}
                onChange={(checked) => setForm({ ...form, can_create_trainings: checked })}
              />

              <PermissionToggle
                label="Can create evaluations"
                checked={form.can_create_evaluations}
                onChange={(checked) => setForm({ ...form, can_create_evaluations: checked })}
              />

              <PermissionToggle
                label="Can view reports"
                checked={form.can_view_reports}
                onChange={(checked) => setForm({ ...form, can_view_reports: checked })}
              />

              <PermissionToggle
                label={form.active ? "Active account" : "Inactive account"}
                checked={form.active}
                onChange={(checked) => setForm({ ...form, active: checked })}
              />
            </div>
          </div>

          <button className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 md:w-auto">
            <Save size={18} />
            Save Changes
          </button>
        </form>
      </div>
    </div>
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