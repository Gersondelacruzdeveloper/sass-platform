import { useEffect, useState } from "react";
import api from "../../../api/axios";
import type { RoadmapItem } from "../types/training";
import RoadmapSection from "../components/RoadmapSection";

export default function RoadmapPage() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [form, setForm] = useState({
    title: "",
    description: "",
    period: "30_days",
    priority: "medium",
  });

  async function loadRoadmap() {
    const res = await api.get("/training/roadmap/");
    setItems(res.data);
  }

  useEffect(() => {
    loadRoadmap();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    await api.post("/training/roadmap/", {
      ...form,
      completed: false,
    });

    setForm({
      title: "",
      description: "",
      period: "30_days",
      priority: "medium",
    });

    loadRoadmap();
  }

  async function toggleComplete(item: RoadmapItem) {
    await api.patch(`/training/roadmap/${item.id}/`, {
      completed: !item.completed,
    });

    loadRoadmap();
  }

  const roadmap30 = items.filter((item) => item.period === "30_days");
  const roadmap60 = items.filter((item) => item.period === "60_days");
  const roadmap90 = items.filter((item) => item.period === "90_days");

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">A&B 90-Day Roadmap</h1>
        <p className="text-gray-500">
          Plan de implementación para mejorar servicio, estándares y resultados.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-bold">Nuevo objetivo</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <input
            required
            className="rounded-xl border px-4 py-3"
            placeholder="Título del objetivo"
            value={form.title}
            onChange={(e) =>
              setForm({ ...form, title: e.target.value })
            }
          />

          <select
            className="rounded-xl border px-4 py-3"
            value={form.period}
            onChange={(e) =>
              setForm({ ...form, period: e.target.value })
            }
          >
            <option value="30_days">Próximos 30 días</option>
            <option value="60_days">Próximos 60 días</option>
            <option value="90_days">Próximos 90 días</option>
          </select>

          <select
            className="rounded-xl border px-4 py-3"
            value={form.priority}
            onChange={(e) =>
              setForm({ ...form, priority: e.target.value })
            }
          >
            <option value="low">Baja prioridad</option>
            <option value="medium">Media prioridad</option>
            <option value="high">Alta prioridad</option>
          </select>
        </div>

        <textarea
          className="mt-4 w-full rounded-xl border px-4 py-3"
          placeholder="Descripción: qué vamos a implementar, por qué y qué resultado buscamos..."
          rows={4}
          value={form.description}
          onChange={(e) =>
            setForm({ ...form, description: e.target.value })
          }
        />

        <button className="mt-4 rounded-xl bg-black px-6 py-3 font-semibold text-white">
          Guardar objetivo
        </button>
      </form>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <RoadmapSection title="30 días" items={roadmap30} />
        <RoadmapSection title="60 días" items={roadmap60} />
        <RoadmapSection title="90 días" items={roadmap90} />
      </div>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold">Actualizar progreso</h2>

        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-xl bg-gray-50 p-4"
            >
              <div>
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-gray-500">
                  {item.period.replace("_", " ")} · {item.priority}
                </p>
              </div>

              <button
                onClick={() => toggleComplete(item)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  item.completed
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {item.completed ? "Completed" : "Mark complete"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}