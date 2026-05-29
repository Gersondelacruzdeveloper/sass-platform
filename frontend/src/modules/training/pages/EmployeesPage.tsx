import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../../../api/axios";
import type { Employee, Outlet } from "../types/training";

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
      const value = `${emp.name} ${emp.position} ${emp.outlet_name || ""}`.toLowerCase();
      return value.includes(search.toLowerCase());
    });
  }, [employees, search]);

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
        await api.patch(`/training/employees/${editingEmployee.id}/`, payload);
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
    return <div className="p-6">Loading employees...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Empleados A&B</h1>
        <p className="text-gray-500">
          Crear, actualizar, eliminar y analizar perfiles de talento A&B.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard title="Total" value={employees.length} />
        <SummaryCard title="Active" value={employees.filter((e) => e.active).length} />
        <SummaryCard
          title="Promotion Ready"
          value={employees.filter((e) => e.promotion_ready).length}
        />
        <SummaryCard
          title="Avg Score"
          value={`${getAverage(employees.map((e) => e.total_score))}%`}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-bold">
              {editingEmployee ? "Update Employee" : "Create Employee"}
            </h2>
            <p className="text-sm text-gray-500">
              Perfil, scores, fortalezas, debilidades y potencial.
            </p>
          </div>

          {editingEmployee && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-xl bg-gray-100 px-4 py-2 font-semibold text-gray-700"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <input
            required
            className="rounded-xl border px-4 py-3"
            placeholder="Nombre"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Código de empleado"
            value={form.employee_code}
            onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
          />

          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Departamento"
            value={form.department}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />

          <select
            className="rounded-xl border px-4 py-3"
            value={form.outlet}
            onChange={(e) => setForm({ ...form, outlet: e.target.value })}
          >
            <option value="">Seleccionar outlet</option>
            {outlets.map((outlet) => (
              <option key={outlet.id} value={outlet.id}>
                {outlet.name}
              </option>
            ))}
          </select>

          <input
            required
            className="rounded-xl border px-4 py-3"
            placeholder="Posición"
            value={form.position}
            onChange={(e) => setForm({ ...form, position: e.target.value })}
          />

          <select
            className="rounded-xl border px-4 py-3"
            value={form.supervisor}
            onChange={(e) => setForm({ ...form, supervisor: e.target.value })}
          >
            <option value="">Seleccionar supervisor</option>
            {employees
              .filter((emp) => emp.id !== editingEmployee?.id)
              .map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} — {emp.position}
                </option>
              ))}
          </select>

          <input
            type="date"
            className="rounded-xl border px-4 py-3"
            value={form.hire_date}
            onChange={(e) => setForm({ ...form, hire_date: e.target.value })}
          />

          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Career goal: Supervisor, Manager..."
            value={form.career_goal}
            onChange={(e) => setForm({ ...form, career_goal: e.target.value })}
          />

          <select
            className="rounded-xl border px-4 py-3"
            value={form.potential_level}
            onChange={(e) => setForm({ ...form, potential_level: e.target.value })}
          >
            <option value="low">Low Potential</option>
            <option value="medium">Medium Potential</option>
            <option value="high">High Potential</option>
            <option value="future_leader">Future Leader</option>
          </select>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Languages: Spanish, English, French"
            value={form.languages}
            onChange={(e) => setForm({ ...form, languages: e.target.value })}
          />

          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Strengths: Smile, speed, leadership"
            value={form.strengths}
            onChange={(e) => setForm({ ...form, strengths: e.target.value })}
          />

          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Weaknesses: Upselling, menu knowledge"
            value={form.weaknesses}
            onChange={(e) => setForm({ ...form, weaknesses: e.target.value })}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-5">
          <ScoreInput
            label="Service"
            value={form.service_score}
            onChange={(value) => setForm({ ...form, service_score: value })}
          />
          <ScoreInput
            label="Leadership"
            value={form.leadership_score}
            onChange={(value) => setForm({ ...form, leadership_score: value })}
          />
          <ScoreInput
            label="Attitude"
            value={form.attitude_score}
            onChange={(value) => setForm({ ...form, attitude_score: value })}
          />
          <ScoreInput
            label="Upselling"
            value={form.upselling_score}
            onChange={(value) => setForm({ ...form, upselling_score: value })}
          />
          <ScoreInput
            label="HR Standard"
            value={form.hard_rock_standard_score}
            onChange={(value) =>
              setForm({ ...form, hard_rock_standard_score: value })
            }
          />
        </div>

        <textarea
          className="mt-4 w-full rounded-xl border px-4 py-3"
          placeholder="Notas: actitud, oportunidades, comentarios del manager..."
          rows={4}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        <div className="mt-4 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.promotion_ready}
              onChange={(e) =>
                setForm({ ...form, promotion_ready: e.target.checked })
              }
            />
            <span className="font-medium">Promotion ready</span>
          </label>

          <label className="flex items-center gap-2 rounded-xl bg-gray-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <span className="font-medium">Active</span>
          </label>
        </div>

        <button
          disabled={saving}
          className="mt-4 rounded-xl bg-black px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : editingEmployee
              ? "Update Employee"
              : "Create Employee"}
        </button>
      </form>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-bold">Employee Directory</h2>
            <p className="text-sm text-gray-500">
              Busca, edita o abre el perfil completo.
            </p>
          </div>

          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Search employee..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {filteredEmployees.length === 0 ? (
            <p className="text-sm text-gray-500">No employees found.</p>
          ) : (
            filteredEmployees.map((emp) => (
              <div
                key={emp.id}
                className="rounded-2xl border bg-white p-5 shadow-sm"
              >
                <div className="flex items-center gap-4">
                  {emp.photo ? (
                    <img
                      src={emp.photo}
                      className="h-14 w-14 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 font-bold">
                      {emp.name[0]}
                    </div>
                  )}

                  <div>
                    <h2 className="font-bold">{emp.name}</h2>
                    <p className="text-sm text-gray-500">{emp.position}</p>
                    <p className="text-xs text-gray-400">
                      {emp.outlet_name || "No outlet"}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Score</span>
                  <span className="text-2xl font-bold">{emp.total_score}%</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm text-yellow-700">
                    {emp.potential_level.replace("_", " ")}
                  </span>

                  {emp.promotion_ready && (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
                      Promotion Ready
                    </span>
                  )}

                  {!emp.active && (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-700">
                      Inactive
                    </span>
                  )}
                </div>

                <div className="mt-4 flex gap-2">
                  <Link
                    to={`/training/employees/${emp.id}`}
                    className="flex-1 rounded-xl bg-black px-4 py-2 text-center text-sm font-semibold text-white"
                  >
                    View
                  </Link>

                  <button
                    onClick={() => handleEdit(emp)}
                    className="flex-1 rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDelete(emp)}
                    className="rounded-xl bg-red-100 px-4 py-2 text-sm font-semibold text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
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
    <div className="rounded-xl border p-4">
      <div className="mb-2 flex justify-between">
        <label className="font-medium">{label}</label>
        <span className="font-bold">{value}/100</span>
      </div>

      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
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