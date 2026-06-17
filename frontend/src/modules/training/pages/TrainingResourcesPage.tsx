import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ImagePlus,
  MonitorPlay,
  Search,
  Timer,
} from "lucide-react";

import { getStandards } from "../api/trainingApi";
import { trainingResourcesApi } from "../api/trainingRecoveryApi";
import type { Standard, TrainingResource } from "../types/training";

const resourceTypes = [
  { value: "visual_poster", label: "Póster Visual" },
  { value: "microlearning", label: "Microlearning" },
  { value: "checklist", label: "Checklist" },
  { value: "facilitator_guide", label: "Guía Facilitador" },
];

const initialForm = {
  title: "",
  standard: "",
  resource_type: "visual_poster",
  short_explanation: "",
  facilitator_notes: "",
  estimated_minutes: 5,
  active: true,
};

export default function TrainingResourcesPage() {
  const [resources, setResources] = useState<TrainingResource[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("all");

  const [form, setForm] = useState(initialForm);
  const [incorrectImage, setIncorrectImage] = useState<File | null>(null);
  const [correctImage, setCorrectImage] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      setLoading(true);

      const [resourcesResponse, standardsData] = await Promise.all([
        trainingResourcesApi.list(),
        getStandards(),
      ]);

      setResources(resourcesResponse.data);
      const loadedStandards = Array.isArray(standardsData)
        ? standardsData
        : (standardsData as { results?: Standard[] }).results ?? [];
      setStandards(loadedStandards);
    } catch (error) {
      console.error("Error loading training resources:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.title.trim()) {
      alert("Title is required.");
      return;
    }

    try {
      setSaving(true);

      const formData = new FormData();

      formData.append("title", form.title.trim());
      formData.append("resource_type", form.resource_type);
      formData.append("short_explanation", form.short_explanation);
      formData.append("facilitator_notes", form.facilitator_notes);
      formData.append("estimated_minutes", String(form.estimated_minutes));
      formData.append("active", form.active ? "true" : "false");

      if (form.standard) {
        formData.append("standard", form.standard);
      }

      if (incorrectImage) {
        formData.append("incorrect_image", incorrectImage);
      }

      if (correctImage) {
        formData.append("correct_image", correctImage);
      }

      await trainingResourcesApi.create(formData);

      setForm(initialForm);
      setIncorrectImage(null);
      setCorrectImage(null);

      const incorrectInput = document.getElementById("incorrect_image") as HTMLInputElement | null;
      const correctInput = document.getElementById("correct_image") as HTMLInputElement | null;

      if (incorrectInput) incorrectInput.value = "";
      if (correctInput) correctInput.value = "";

      await loadData();
    } catch (error) {
      console.error("Error creating resource:", error);
      alert("Could not create training resource.");
    } finally {
      setSaving(false);
    }
  }

  const filteredResources = useMemo(() => {
    return resources.filter((item) => {
      const value = `
        ${item.title}
        ${item.standard_title || ""}
        ${item.resource_type}
        ${item.short_explanation || ""}
        ${item.facilitator_notes || ""}
      `.toLowerCase();

      const matchesSearch = value.includes(search.toLowerCase());
      const matchesType = selectedType === "all" || item.resource_type === selectedType;

      return matchesSearch && matchesType;
    });
  }, [resources, search, selectedType]);

  const activeCount = resources.filter((item) => item.active).length;
  const posterCount = resources.filter((item) => item.resource_type === "visual_poster").length;
  const microlearningCount = resources.filter((item) => item.resource_type === "microlearning").length;

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
                <MonitorPlay size={16} />
                Biblioteca Visual de Capacitación
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Recursos Visuales A&B
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Crea pósters, microtrainings y guías para que los facilitadores puedan explicar claramente qué es correcto y qué no cumple el estándar.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5">
              <p className="text-sm font-semibold text-white/60">Recursos Activos</p>
              <p className="mt-2 text-4xl font-black">{activeCount}</p>
              <p className="mt-1 text-sm text-white/60">listos para entrenamiento</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Recursos" value={resources.length} icon={<BookOpenCheck />} />
          <SummaryCard title="Activos" value={activeCount} icon={<CheckCircle2 />} />
          <SummaryCard title="Pósters" value={posterCount} icon={<ImagePlus />} />
          <SummaryCard title="Microlearning" value={microlearningCount} icon={<Timer />} />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5">
            <h2 className="text-2xl font-black text-slate-950">Crear Recurso Visual</h2>
            <p className="text-sm text-slate-500">
              Sube imágenes de INCORRECTO y CORRECTO, y agrega la explicación que usará el facilitador.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              required
              label="Título"
              placeholder="Take Time To Be Kind"
              value={form.title}
              onChange={(value) => setForm({ ...form, title: value })}
            />

            <Select
              label="Estándar"
              value={form.standard}
              onChange={(value) => setForm({ ...form, standard: value })}
            >
              <option value="">Sin estándar</option>
              {standards.map((standard) => (
                <option key={standard.id} value={standard.id}>
                  {standard.title}
                </option>
              ))}
            </Select>

            <Select
              label="Tipo"
              value={form.resource_type}
              onChange={(value) => setForm({ ...form, resource_type: value })}
            >
              {resourceTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">Imagen INCORRECTO</span>
              <input
                id="incorrect_image"
                type="file"
                accept="image/*"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                onChange={(e) => setIncorrectImage(e.target.files ? e.target.files[0] : null)}
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-bold text-slate-700">Imagen CORRECTO</span>
              <input
                id="correct_image"
                type="file"
                accept="image/*"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                onChange={(e) => setCorrectImage(e.target.files ? e.target.files[0] : null)}
              />
            </label>

            <Input
              label="Duración Minutos"
              type="number"
              value={String(form.estimated_minutes)}
              onChange={(value) =>
                setForm({
                  ...form,
                  estimated_minutes: Number(value),
                })
              }
            />
          </div>

          <textarea
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="Explicación corta: qué está mal, qué está correcto y por qué impacta al huésped."
            rows={3}
            value={form.short_explanation}
            onChange={(e) => setForm({ ...form, short_explanation: e.target.value })}
          />

          <textarea
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="Nota para el facilitador: cómo debe explicar este recurso en 3-5 minutos."
            rows={4}
            value={form.facilitator_notes}
            onChange={(e) => setForm({ ...form, facilitator_notes: e.target.value })}
          />

          <label className="mt-4 flex w-fit cursor-pointer items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-slate-950"
            />
            <span className="font-bold text-slate-700">Activo</span>
          </label>

          <button
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 disabled:opacity-50 md:w-auto"
          >
            {saving ? "Guardando..." : "Guardar Recurso"}
          </button>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">Biblioteca de Recursos</h2>
              <p className="text-sm text-slate-500">
                Recursos para facilitadores: imágenes, guías y microlearning.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:min-w-[560px]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="Buscar recursos..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
              >
                <option value="all">Todos los Tipos</option>
                {resourceTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredResources.length} de {resources.length} recursos
          </div>

          {filteredResources.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">No se encontraron recursos.</p>
              <p className="mt-1 text-sm text-slate-500">
                Crea el primer póster visual o cambia los filtros.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredResources.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ResourceCard({ resource }: { resource: TrainingResource }) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">{resource.title}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {resource.standard_title || "Sin estándar asignado"}
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${
              resource.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}
          >
            {resource.active ? "ACTIVE" : "INACTIVE"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ImageBox label="INCORRECTO" image={resource.incorrect_image} tone="red" />
          <ImageBox label="CORRECTO" image={resource.correct_image} tone="green" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge>{formatResourceType(resource.resource_type)}</Badge>
          <Badge>{resource.estimated_minutes} min</Badge>
        </div>

        {resource.short_explanation && (
          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-400">Explicación</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{resource.short_explanation}</p>
          </div>
        )}

        {resource.facilitator_notes && (
          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-400">Nota Facilitador</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{resource.facilitator_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ImageBox({
  label,
  image,
  tone,
}: {
  label: string;
  image?: string | null;
  tone: "red" | "green";
}) {
  const style = tone === "red" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className={`px-4 py-2 text-xs font-black ${style}`}>{label}</div>

      {image ? (
        <img src={image} alt={label} className="h-56 w-full object-cover" />
      ) : (
        <div className="flex h-56 items-center justify-center bg-slate-100 text-sm font-bold text-slate-400">
          Sin imagen
        </div>
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
          <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">{value}</p>
        </div>

        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">{icon}</div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-black text-slate-700">
      {children}
    </span>
  );
}

function formatResourceType(type: string) {
  return type.replace("_", " ").toUpperCase();
}