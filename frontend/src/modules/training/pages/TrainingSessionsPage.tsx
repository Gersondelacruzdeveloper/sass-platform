import { useEffect, useState } from "react";
import api from "../../../api/axios";
import type { Employee, TrainingSession } from "../types/training";

type Outlet = {
  id: number;
  name: string;
};

type Facilitator = {
  id: number;
  employee_name: string;
};

const initialForm = {
  title: "",
  topic: "",
  description: "",
  facilitator: "",
  outlet: "",
  start_datetime: "",
  end_datetime: "",
  expected_attendees: 0,
  attendance_percentage: 0,
  attendees: [] as number[],
  status: "scheduled",
};

export default function TrainingSessionsPage() {
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      setLoading(true);

      const [sessionsRes, employeesRes, outletsRes, facilitatorsRes] =
        await Promise.all([
          api.get("/training/training-sessions/"),
          api.get("/training/employees/"),
          api.get("/training/outlets/"),
          api.get("/training/facilitators/"),
        ]);

      setSessions(sessionsRes.data);
      setEmployees(employeesRes.data);
      setOutlets(outletsRes.data);
      setFacilitators(facilitatorsRes.data);
    } catch (error) {
      console.error("Error loading training sessions data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      await api.post("/training/training-sessions/", {
        ...form,
        facilitator: form.facilitator ? Number(form.facilitator) : null,
        outlet: form.outlet ? Number(form.outlet) : null,
        expected_attendees: Number(form.expected_attendees),
        attendance_percentage: Number(form.attendance_percentage),
      });

      setForm(initialForm);
      await loadData();
    } catch (error) {
      console.error("Error creating training session:", error);
      alert("Could not create training session.");
    } finally {
      setSaving(false);
    }
  }

  function toggleAttendee(employeeId: number) {
    setForm((prev) => ({
      ...prev,
      attendees: prev.attendees.includes(employeeId)
        ? prev.attendees.filter((id) => id !== employeeId)
        : [...prev.attendees, employeeId],
    }));
  }

  async function updateStatus(session: TrainingSession, status: string) {
    try {
      await api.patch(`/training/training-sessions/${session.id}/`, {
        status,
      });

      loadData();
    } catch (error) {
      console.error("Error updating session status:", error);
      alert("Could not update status.");
    }
  }

  if (loading) {
    return <div className="p-6">Loading training sessions...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Training Sessions</h1>
        <p className="text-gray-500">
          Programa entrenamientos, asigna facilitadores y controla asistencia.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard title="Total Sessions" value={sessions.length} />
        <SummaryCard
          title="Scheduled"
          value={sessions.filter((s) => s.status === "scheduled").length}
        />
        <SummaryCard
          title="In Progress"
          value={sessions.filter((s) => s.status === "in_progress").length}
        />
        <SummaryCard
          title="Completed"
          value={sessions.filter((s) => s.status === "completed").length}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-bold">Nuevo entrenamiento</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input
            required
            className="rounded-xl border px-4 py-3"
            placeholder="Título: Guest Recovery Excellence"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <input
            required
            className="rounded-xl border px-4 py-3"
            placeholder="Tema: Manejo de quejas, servicio premium..."
            value={form.topic}
            onChange={(e) => setForm({ ...form, topic: e.target.value })}
          />

          <select
            className="rounded-xl border px-4 py-3"
            value={form.facilitator}
            onChange={(e) =>
              setForm({ ...form, facilitator: e.target.value })
            }
          >
            <option value="">Seleccionar facilitador</option>
            {facilitators.map((facilitator) => (
              <option key={facilitator.id} value={facilitator.id}>
                {facilitator.employee_name}
              </option>
            ))}
          </select>

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
            type="datetime-local"
            className="rounded-xl border px-4 py-3"
            value={form.start_datetime}
            onChange={(e) =>
              setForm({ ...form, start_datetime: e.target.value })
            }
          />

          <input
            required
            type="datetime-local"
            className="rounded-xl border px-4 py-3"
            value={form.end_datetime}
            onChange={(e) =>
              setForm({ ...form, end_datetime: e.target.value })
            }
          />

          <input
            type="number"
            min={0}
            className="rounded-xl border px-4 py-3"
            placeholder="Expected attendees"
            value={form.expected_attendees}
            onChange={(e) =>
              setForm({
                ...form,
                expected_attendees: Number(e.target.value),
              })
            }
          />

          <input
            type="number"
            min={0}
            max={100}
            className="rounded-xl border px-4 py-3"
            placeholder="Attendance %"
            value={form.attendance_percentage}
            onChange={(e) =>
              setForm({
                ...form,
                attendance_percentage: Number(e.target.value),
              })
            }
          />

          <select
            className="rounded-xl border px-4 py-3"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <textarea
          className="mt-4 w-full rounded-xl border px-4 py-3"
          placeholder="Descripción del entrenamiento..."
          rows={4}
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
        />

        <div className="mt-4 rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold">Asistentes</h3>
            <span className="text-sm text-gray-500">
              {form.attendees.length} seleccionados
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
                  checked={form.attendees.includes(employee.id)}
                  onChange={() => toggleAttendee(employee.id)}
                />
                <span>
                  {employee.name} — {employee.position}
                </span>
              </label>
            ))}
          </div>
        </div>

        <button
          disabled={saving}
          className="mt-4 rounded-xl bg-black px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Crear entrenamiento"}
        </button>
      </form>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">Entrenamientos programados</h2>

        <div className="space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay entrenamientos programados.
            </p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="rounded-xl border border-gray-100 bg-gray-50 p-4"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{session.title}</h3>
                    <p className="text-sm text-gray-500">{session.topic}</p>

                    <p className="mt-1 text-xs text-gray-400">
                      {session.outlet_name || "No outlet"} ·{" "}
                      {session.facilitator_name || "No facilitator"}
                    </p>

                    <p className="mt-2 text-sm text-gray-600">
                      {formatDate(session.start_datetime)} —{" "}
                      {formatDate(session.end_datetime)}
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-700 md:grid-cols-3">
                      <InfoPill
                        label="Selected"
                        value={`${session.attendees?.length || 0}`}
                      />
                      <InfoPill
                        label="Expected"
                        value={`${session.expected_attendees || 0}`}
                      />
                      <InfoPill
                        label="Attendance"
                        value={`${session.attendance_percentage || 0}%`}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-2 md:items-end">
                    <StatusBadge status={session.status} />

                    <select
                      className="rounded-lg border px-3 py-2 text-sm"
                      value={session.status}
                      onChange={(e) =>
                        updateStatus(session, e.target.value)
                      }
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>

                {session.description && (
                  <p className="mt-3 text-sm text-gray-600">
                    {session.description}
                  </p>
                )}
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

function InfoPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "completed"
      ? "bg-green-100 text-green-700"
      : status === "in_progress"
        ? "bg-yellow-100 text-yellow-700"
        : status === "cancelled"
          ? "bg-red-100 text-red-700"
          : "bg-blue-100 text-blue-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${styles}`}>
      {status.replace("_", " ").toUpperCase()}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}