import { useEffect, useState } from "react";
import {
  createOutlet,
  getOutlets,
  updateOutlet,
} from "../api/trainingApi";
import api from "../../../api/axios";
import type { Outlet } from "../types/training";

const initialForm = {
  name: "",
  area: "",
  manager: "",
  description: "",
  active: true,
};

export default function OutletsPage() {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [form, setForm] = useState(initialForm);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadOutlets() {
    try {
      setLoading(true);
      const data = await getOutlets();
      setOutlets(data);
    } catch (error) {
      console.error("Error loading outlets:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOutlets();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      if (editingOutlet) {
        await updateOutlet(editingOutlet.id, form);
      } else {
        await createOutlet(form);
      }

      setForm(initialForm);
      setEditingOutlet(null);
      await loadOutlets();
    } catch (error) {
      console.error("Error saving outlet:", error);
      alert("Could not save outlet.");
    } finally {
      setSaving(false);
    }
  }

  function handleEdit(outlet: Outlet) {
    setEditingOutlet(outlet);

    setForm({
      name: outlet.name || "",
      area: outlet.area || "",
      manager: outlet.manager || "",
      description: outlet.description || "",
      active: outlet.active ?? true,
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(outlet: Outlet) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${outlet.name}?`
    );

    if (!confirmed) return;

    try {
      await api.delete(`/training/outlets/${outlet.id}/`);
      await loadOutlets();
    } catch (error) {
      console.error("Error deleting outlet:", error);
      alert(
        "Could not delete this outlet. If it has employees or trainings assigned, deactivate it instead."
      );
    }
  }

  async function toggleActive(outlet: Outlet) {
    try {
      await updateOutlet(outlet.id, {
        active: !outlet.active,
      });

      await loadOutlets();
    } catch (error) {
      console.error("Error updating outlet:", error);
      alert("Could not update outlet status.");
    }
  }

  function cancelEdit() {
    setEditingOutlet(null);
    setForm(initialForm);
  }

  if (loading) {
    return <div className="p-6">Loading outlets...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Restaurantes & Bares A&B</h1>
        <p className="text-gray-500">
          Restaurantes, bares y áreas A&B con score, empleados y cumplimiento de estándares.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard title="Outlets" value={outlets.length} />

        <SummaryCard
          title="Activos"
          value={outlets.filter((item) => item.active).length}
        />

        <SummaryCard
          title="Employees"
          value={outlets.reduce(
            (total, item) => total + item.employees_count,
            0
          )}
        />

        <SummaryCard
          title="Avg HR Score"
          value={`${getAverage(outlets.map((item) => item.hard_rock_score))}%`}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
          <div>
            <h2 className="text-xl font-bold">
              {editingOutlet ? "Actualizar outlet" : "Crear nuevo outlet"}
            </h2>

            <p className="text-sm text-gray-500">
              {editingOutlet
                ? `Editando: ${editingOutlet.name}`
                : "Crea restaurantes, bares, buffet, room service o puntos A&B."}
            </p>
          </div>

          {editingOutlet && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-xl bg-gray-100 px-4 py-2 font-semibold text-gray-700"
            >
              Cancel edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input
            required
            className="rounded-xl border px-4 py-3"
            placeholder="Nombre: Toro, Zen, Eclipse Bar..."
            value={form.name}
            onChange={(e) =>
              setForm({
                ...form,
                name: e.target.value,
              })
            }
          />

          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Área: Restaurant, Bar, Buffet, Room Service..."
            value={form.area}
            onChange={(e) =>
              setForm({
                ...form,
                area: e.target.value,
              })
            }
          />

          <input
            className="rounded-xl border px-4 py-3"
            placeholder="Manager encargado"
            value={form.manager}
            onChange={(e) =>
              setForm({
                ...form,
                manager: e.target.value,
              })
            }
          />

          <label className="flex items-center gap-3 rounded-xl border px-4 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) =>
                setForm({
                  ...form,
                  active: e.target.checked,
                })
              }
            />
            <span className="font-medium">Active outlet</span>
          </label>
        </div>

        <textarea
          className="mt-4 w-full rounded-xl border px-4 py-3"
          placeholder="Notas del outlet: enfoque, problemas, oportunidades, estándares críticos..."
          rows={4}
          value={form.description}
          onChange={(e) =>
            setForm({
              ...form,
              description: e.target.value,
            })
          }
        />

        <button
          disabled={saving}
          className="mt-4 rounded-xl bg-black px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving
            ? "Saving..."
            : editingOutlet
              ? "Update outlet"
              : "Guardar outlet"}
        </button>
      </form>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">Lista de outlets</h2>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {outlets.length === 0 ? (
            <p className="text-sm text-gray-500">No outlets yet.</p>
          ) : (
            outlets.map((outlet) => (
              <div
                key={outlet.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold">{outlet.name}</h3>

                    <p className="text-sm text-gray-500">
                      {outlet.area || "No area"} · Manager:{" "}
                      {outlet.manager || "No manager"}
                    </p>
                  </div>

                  <button
                    onClick={() => toggleActive(outlet)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      outlet.active
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {outlet.active ? "ACTIVE" : "INACTIVE"}
                  </button>
                </div>

                {outlet.description && (
                  <p className="mt-3 text-sm text-gray-600">
                    {outlet.description}
                  </p>
                )}

                <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <MetricBox label="Employees" value={outlet.employees_count} />
                  <MetricBox label="Avg Score" value={`${outlet.average_score}%`} />
                  <MetricBox
                    label="HR Standard"
                    value={`${outlet.hard_rock_score}%`}
                  />
                </div>

                <div className="mt-4">
                  <ScoreBar
                    label="Outlet Performance"
                    value={outlet.average_score}
                  />

                  <ScoreBar
                    label="Hard Rock Compliance"
                    value={outlet.hard_rock_score}
                  />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleEdit(outlet)}
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDelete(outlet)}
                    className="rounded-xl bg-red-100 px-4 py-2 text-sm font-semibold text-red-700"
                  >
                    Delete
                  </button>

                  <button
                    onClick={() => toggleActive(outlet)}
                    className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700"
                  >
                    {outlet.active ? "Deactivate" : "Activate"}
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

function MetricBox({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl bg-white p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-3">
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold">{value}%</span>
      </div>

      <div className="h-2 rounded-full bg-gray-200">
        <div
          className="h-2 rounded-full bg-black"
          style={{
            width: `${Math.min(value, 100)}%`,
          }}
        />
      </div>
    </div>
  );
}

function getAverage(values: number[]) {
  if (!values.length) return 0;

  const cleanValues = values.filter((value) => value > 0);

  if (!cleanValues.length) return 0;

  const total = cleanValues.reduce((sum, value) => sum + value, 0);

  return Math.round(total / cleanValues.length);
}