import { useEffect, useState } from "react";
import api from "../../../api/axios";
import type { Employee } from "../types/training";

type Facilitator = {
  id: number;
  employee: number;
  employee_name: string;
  assigned_employees: number[];
  active: boolean;
};

export default function FacilitatorsPage() {
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [form, setForm] = useState({
    employee: "",
    assigned_employees: [] as number[],
    specialties: "",
    active: true,
  });

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await api.post("/training/facilitators/", {
      employee: Number(form.employee),
      assigned_employees: form.assigned_employees,
      specialties: form.specialties
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      active: form.active,
    });

    setForm({
      employee: "",
      assigned_employees: [],
      specialties: "",
      active: true,
    });

    loadData();
  }

  async function toggleActive(facilitator: Facilitator) {
    await api.patch(`/training/facilitators/${facilitator.id}/`, {
      active: !facilitator.active,
    });

    loadData();
  }

  function toggleAssignedEmployee(employeeId: number) {
    setForm((prev) => ({
      ...prev,
      assigned_employees: prev.assigned_employees.includes(employeeId)
        ? prev.assigned_employees.filter((id) => id !== employeeId)
        : [...prev.assigned_employees, employeeId],
    }));
  }

  function getEmployeeName(id: number) {
    return (
      employees.find((employee) => employee.id === id)?.name ||
      `Empleado #${id}`
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Facilitators</h1>
        <p className="text-gray-500">
          Administra los 50 facilitadores internos y sus empleados asignados.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SummaryCard
          title="Facilitadores totales"
          value={facilitators.length}
        />
        <SummaryCard
          title="Activos"
          value={facilitators.filter((item) => item.active).length}
        />
        <SummaryCard
          title="Personas asignadas"
          value={facilitators.reduce(
            (total, item) => total + (item.assigned_employees?.length || 0),
            0,
          )}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-bold">Nuevo facilitador</h2>

        <select
          required
          className="w-full rounded-xl border px-4 py-3"
          value={form.employee}
          onChange={(e) => setForm({ ...form, employee: e.target.value })}
        >
          <option value="">Seleccionar empleado como facilitador</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} — {employee.position}
            </option>
          ))}
        </select>
        <input
          className="mt-4 w-full rounded-xl border px-4 py-3"
          placeholder="Specialties: Wine, Guest Service, Upselling, Leadership"
          value={form.specialties}
          onChange={(e) => setForm({ ...form, specialties: e.target.value })}
        />

        <div className="mt-4 rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Empleados asignados</h3>
            <span className="text-sm text-gray-500">
              {form.assigned_employees.length} seleccionados
            </span>
          </div>

          <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2 lg:grid-cols-3">
            {employees.map((employee) => (
              <label
                key={employee.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm hover:bg-gray-100"
              >
                <input
                  type="checkbox"
                  checked={form.assigned_employees.includes(employee.id)}
                  onChange={() => toggleAssignedEmployee(employee.id)}
                  disabled={String(employee.id) === form.employee}
                />

                <span>
                  {employee.name} — {employee.position}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button className="mt-4 rounded-xl bg-black px-6 py-3 font-semibold text-white">
          Crear facilitador
        </button>
      </form>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">Lista de facilitadores</h2>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {facilitators.length === 0 ? (
            <p className="text-sm text-gray-500">No facilitators yet.</p>
          ) : (
            facilitators.map((facilitator) => (
              <div
                key={facilitator.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold">
                      {facilitator.employee_name}
                    </h3>

                    <p className="text-sm text-gray-500">
                      {facilitator.assigned_employees?.length || 0} empleados
                      asignados
                    </p>
                  </div>

                  <button
                    onClick={() => toggleActive(facilitator)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      facilitator.active
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {facilitator.active ? "ACTIVE" : "INACTIVE"}
                  </button>
                </div>
                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    Specialties
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {facilitator.specialties?.map((item) => (
                      <span
                        key={item}
                        className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    Equipo asignado
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {facilitator.assigned_employees?.length ? (
                      facilitator.assigned_employees.map((employeeId) => (
                        <span
                          key={employeeId}
                          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700"
                        >
                          {getEmployeeName(employeeId)}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">
                        No hay empleados asignados.
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="mb-2 text-sm font-semibold text-gray-700">
                    Equipo asignado
                  </p>

                  <div className="flex flex-wrap gap-2">
                    {facilitator.assigned_employees?.length ? (
                      facilitator.assigned_employees.map((employeeId) => (
                        <span
                          key={employeeId}
                          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700"
                        >
                          {getEmployeeName(employeeId)}
                        </span>
                      ))
                    ) : (
                      <span className="text-sm text-gray-500">
                        No hay empleados asignados.
                      </span>
                    )}
                  </div>
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
