import { useEffect, useMemo, useState } from "react";
import {
  createStandard,
  getStandards,
  updateStandard,
} from "../api/trainingApi";
import type { Standard } from "../types/training";

const categories = [
  { value: "service", label: "Service" },
  { value: "beverage", label: "Beverage" },
  { value: "culinary", label: "Culinary" },
  { value: "luxury", label: "Luxury" },
  { value: "leadership", label: "Leadership" },
  { value: "hard_rock", label: "Hard Rock Standard" },
];

const initialForm = {
  title: "",
  category: "service",
  description: "",
  priority: "medium" as Standard["priority"],
  active: true,
};

export default function StandardsPage() {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadStandards() {
    try {
      setLoading(true);
      const data = await getStandards();
      setStandards(data);
    } catch (error) {
      console.error("Error loading standards:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStandards();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      await createStandard(form);
      setForm(initialForm);
      await loadStandards();
    } catch (error) {
      console.error("Error creating standard:", error);
      alert("Could not create standard.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(standard: Standard) {
    try {
      await updateStandard(standard.id, {
        active: !standard.active,
      });

      await loadStandards();
    } catch (error) {
      console.error("Error updating standard:", error);
      alert("Could not update standard.");
    }
  }

  const filteredStandards = useMemo(() => {
    if (selectedCategory === "all") return standards;
    return standards.filter((item) => item.category === selectedCategory);
  }, [standards, selectedCategory]);

  if (loading) {
    return <div className="p-6">Loading standards...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Hard Rock A&B Standards</h1>
        <p className="text-gray-500">
          Define estándares de servicio, bebidas, cocina, lujo, liderazgo y cultura.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard title="Standards" value={standards.length} />
        <SummaryCard
          title="Active"
          value={standards.filter((item) => item.active).length}
        />
        <SummaryCard
          title="Critical"
          value={standards.filter((item) => item.priority === "critical").length}
        />
        <SummaryCard
          title="High Priority"
          value={standards.filter((item) => item.priority === "high").length}
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-xl font-bold">Create Standard</h2>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <input
            required
            className="rounded-xl border px-4 py-3"
            placeholder="Example: Greet guest within 10 seconds"
            value={form.title}
            onChange={(e) =>
              setForm({
                ...form,
                title: e.target.value,
              })
            }
          />

          <select
            className="rounded-xl border px-4 py-3"
            value={form.category}
            onChange={(e) =>
              setForm({
                ...form,
                category: e.target.value,
              })
            }
          >
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>

          <select
            className="rounded-xl border px-4 py-3"
            value={form.priority}
            onChange={(e) =>
              setForm({
                ...form,
                priority: e.target.value as Standard["priority"],
              })
            }
          >
            <option value="low">Low Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="high">High Priority</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <textarea
          className="mt-4 w-full rounded-xl border px-4 py-3"
          placeholder="Description: what should the employee do? What does excellent service look like?"
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
          {saving ? "Saving..." : "Save Standard"}
        </button>
      </form>

      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <h2 className="text-xl font-bold">Standards Library</h2>

          <select
            className="rounded-xl border px-4 py-3"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="all">All Categories</option>

            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredStandards.length === 0 ? (
            <p className="text-sm text-gray-500">No standards yet.</p>
          ) : (
            filteredStandards.map((standard) => (
              <div
                key={standard.id}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold">{standard.title}</h3>
                      <PriorityBadge priority={standard.priority} />
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {formatCategory(standard.category)}
                    </p>
                  </div>

                  <button
                    onClick={() => toggleActive(standard)}
                    className={`rounded-full px-3 py-1 text-xs font-bold ${
                      standard.active
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {standard.active ? "ACTIVE" : "INACTIVE"}
                  </button>
                </div>

                {standard.description && (
                  <p className="mt-4 text-sm text-gray-600">
                    {standard.description}
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

function PriorityBadge({ priority }: { priority: string }) {
  const styles =
    priority === "critical"
      ? "bg-red-100 text-red-700"
      : priority === "high"
        ? "bg-orange-100 text-orange-700"
        : priority === "medium"
          ? "bg-yellow-100 text-yellow-700"
          : "bg-green-100 text-green-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${styles}`}>
      {priority.toUpperCase()}
    </span>
  );
}

function formatCategory(category: string) {
  return category.replace("_", " ").toUpperCase();
}