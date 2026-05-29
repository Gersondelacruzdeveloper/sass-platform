import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  ClipboardList,
  PlayCircle,
  Search,
  Users,
  XCircle,
} from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      const value = `
        ${session.title}
        ${session.topic}
        ${session.description || ""}
        ${session.outlet_name || ""}
        ${session.facilitator_name || ""}
        ${session.status}
      `.toLowerCase();

      const matchesSearch = value.includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || session.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [sessions, search, statusFilter]);

  const scheduled = sessions.filter((s) => s.status === "scheduled").length;
  const inProgress = sessions.filter((s) => s.status === "in_progress").length;
  const completed = sessions.filter((s) => s.status === "completed").length;
  const cancelled = sessions.filter((s) => s.status === "cancelled").length;

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
                <CalendarClock size={16} />
                Training Schedule Center
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Training Sessions
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Programa entrenamientos, asigna facilitadores, controla asistencia y permite que dirección vea rápido qué está pendiente, activo o completado.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5">
              <p className="text-sm font-semibold text-white/60">
                Sesiones completadas
              </p>
              <p className="mt-2 text-4xl font-black">{completed}</p>
              <p className="mt-1 text-sm text-white/60">
                de {sessions.length} entrenamientos
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard title="Total Sessions" value={sessions.length} icon={<ClipboardList />} />
          <SummaryCard title="Scheduled" value={scheduled} icon={<Clock />} />
          <SummaryCard title="In Progress" value={inProgress} icon={<PlayCircle />} />
          <SummaryCard title="Completed" value={completed} icon={<CheckCircle2 />} />
          <SummaryCard title="Cancelled" value={cancelled} icon={<XCircle />} />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5">
            <h2 className="text-2xl font-black text-slate-950">
              Nuevo entrenamiento
            </h2>
            <p className="text-sm text-slate-500">
              Crea una sesión con facilitador, outlet, horario y asistentes.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              required
              label="Título"
              placeholder="Guest Recovery Excellence"
              value={form.title}
              onChange={(value) => setForm({ ...form, title: value })}
            />

            <Input
              required
              label="Tema"
              placeholder="Manejo de quejas, servicio premium..."
              value={form.topic}
              onChange={(value) => setForm({ ...form, topic: value })}
            />

            <Select
              label="Facilitador"
              value={form.facilitator}
              onChange={(value) => setForm({ ...form, facilitator: value })}
            >
              <option value="">Seleccionar facilitador</option>
              {facilitators.map((facilitator) => (
                <option key={facilitator.id} value={facilitator.id}>
                  {facilitator.employee_name}
                </option>
              ))}
            </Select>

            <Select
              label="Outlet"
              value={form.outlet}
              onChange={(value) => setForm({ ...form, outlet: value })}
            >
              <option value="">Seleccionar outlet</option>
              {outlets.map((outlet) => (
                <option key={outlet.id} value={outlet.id}>
                  {outlet.name}
                </option>
              ))}
            </Select>

            <Input
              required
              label="Inicio"
              type="datetime-local"
              value={form.start_datetime}
              onChange={(value) => setForm({ ...form, start_datetime: value })}
            />

            <Input
              required
              label="Fin"
              type="datetime-local"
              value={form.end_datetime}
              onChange={(value) => setForm({ ...form, end_datetime: value })}
            />

            <Input
              label="Asistentes esperados"
              type="number"
              value={String(form.expected_attendees)}
              onChange={(value) =>
                setForm({ ...form, expected_attendees: Number(value) })
              }
            />

            <Input
              label="Asistencia %"
              type="number"
              value={String(form.attendance_percentage)}
              onChange={(value) =>
                setForm({ ...form, attendance_percentage: Number(value) })
              }
            />

            <Select
              label="Estado"
              value={form.status}
              onChange={(value) => setForm({ ...form, status: value })}
            >
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </div>

          <textarea
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="Descripción del entrenamiento..."
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h3 className="font-black text-slate-950">Asistentes</h3>
                <p className="text-sm text-slate-500">
                  Selecciona quién debe asistir a este entrenamiento.
                </p>
              </div>

              <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
                {form.attendees.length} seleccionados
              </span>
            </div>

            <div className="grid max-h-80 grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
              {employees.map((employee) => {
                const selected = form.attendees.includes(employee.id);

                return (
                  <button
                    type="button"
                    key={employee.id}
                    onClick={() => toggleAttendee(employee.id)}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      selected
                        ? "border-slate-950 bg-white shadow-sm"
                        : "border-transparent bg-white/70 hover:bg-white"
                    }`}
                  >
                    <div>
                      <p className="font-bold text-slate-950">{employee.name}</p>
                      <p className="text-xs text-slate-500">
                        {employee.position} · {employee.outlet_name || "No outlet"}
                      </p>
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
              })}
            </div>
          </div>

          <button
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 disabled:opacity-50 md:w-auto"
          >
            {saving ? "Guardando..." : "Crear entrenamiento"}
          </button>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Entrenamientos programados
              </h2>
              <p className="text-sm text-slate-500">
                Busca por título, tema, facilitador, outlet o estado.
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
                  placeholder="Search training..."
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
                <option value="scheduled">Scheduled</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredSessions.length} de {sessions.length} entrenamientos
          </div>

          {filteredSessions.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">
                No hay entrenamientos encontrados.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Intenta cambiar la búsqueda o el filtro.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredSessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onStatusChange={(status) => updateStatus(session, status)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SessionCard({
  session,
  onStatusChange,
}: {
  session: TrainingSession;
  onStatusChange: (status: string) => void;
}) {
  const attendance = Number(session.attendance_percentage || 0);

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <StatusBadge status={session.status} />

          <h3 className="mt-3 text-xl font-black text-slate-950">
            {session.title}
          </h3>

          <p className="mt-1 text-sm font-medium text-slate-500">
            {session.topic}
          </p>

          <p className="mt-2 text-xs font-semibold text-slate-400">
            {session.outlet_name || "No outlet"} ·{" "}
            {session.facilitator_name || "No facilitator"}
          </p>

          <p className="mt-3 text-sm font-semibold text-slate-600">
            {formatDate(session.start_datetime)} — {formatDate(session.end_datetime)}
          </p>
        </div>

        <select
          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none"
          value={session.status}
          onChange={(e) => onStatusChange(e.target.value)}
        >
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <InfoPill label="Selected" value={session.attendees?.length || 0} />
        <InfoPill label="Expected" value={session.expected_attendees || 0} />
        <InfoPill label="Attendance" value={`${attendance}%`} />
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${
            attendance >= 85
              ? "bg-emerald-500"
              : attendance >= 60
                ? "bg-amber-500"
                : "bg-red-500"
          }`}
          style={{ width: `${Math.min(attendance, 100)}%` }}
        />
      </div>

      {session.description && (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-600">
          {session.description}
        </p>
      )}
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

function InfoPill({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "completed"
      ? "bg-emerald-100 text-emerald-700"
      : status === "in_progress"
        ? "bg-amber-100 text-amber-700"
        : status === "cancelled"
          ? "bg-red-100 text-red-700"
          : "bg-blue-100 text-blue-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${styles}`}>
      {status.replace("_", " ").toUpperCase()}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}