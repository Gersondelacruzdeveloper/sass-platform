import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  FileQuestion,
  Layers3,
  PlusCircle,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import api from "../../../api/axios";

type Standard = {
  id: number;
  title: string;
};

type EvaluationTemplate = {
  id: number;
  name: string;
  description: string;
  active: boolean;
};

type QuestionForm = {
  question: string;
  standard: string;
  weight: number;
  score_type: string;
};

const initialForm = {
  name: "",
  description: "",
  active: true,
};

const initialQuestion: QuestionForm = {
  question: "",
  standard: "",
  weight: 1,
  score_type: "score",
};

export default function EvaluationTemplatesPage() {
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [standards, setStandards] = useState<Standard[]>([]);
  const [form, setForm] = useState(initialForm);
  const [questions, setQuestions] = useState<QuestionForm[]>([initialQuestion]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      setLoading(true);

      const [templatesRes, standardsRes] = await Promise.all([
        api.get("/training/evaluation-templates/"),
        api.get("/training/standards/"),
      ]);

      setTemplates(templatesRes.data);
      setStandards(standardsRes.data);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredTemplates = useMemo(() => {
    return templates.filter((template) => {
      const value = `
        ${template.name}
        ${template.description || ""}
        ${template.active ? "active" : "inactive"}
      `.toLowerCase();

      const matchesSearch = value.includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && template.active) ||
        (statusFilter === "inactive" && !template.active);

      return matchesSearch && matchesStatus;
    });
  }, [templates, search, statusFilter]);

  const activeTemplates = templates.filter((template) => template.active).length;
  const inactiveTemplates = templates.length - activeTemplates;
  const totalWeight = questions.reduce(
    (total, question) => total + Number(question.weight || 0),
    0
  );

  function addQuestion() {
    setQuestions([...questions, { ...initialQuestion }]);
  }

  function removeQuestion(index: number) {
    if (questions.length === 1) return;
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function updateQuestion(
    index: number,
    field: keyof QuestionForm,
    value: string | number
  ) {
    const copy = [...questions];

    copy[index] = {
      ...copy[index],
      [field]: value,
    };

    setQuestions(copy);
  }

  function resetForm() {
    setForm(initialForm);
    setQuestions([{ ...initialQuestion }]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validQuestions = questions.filter((question) =>
      question.question.trim()
    );

    if (!validQuestions.length) {
      alert("Please add at least one question.");
      return;
    }

    try {
      setSaving(true);

      const templateRes = await api.post("/training/evaluation-templates/", form);
      const templateId = templateRes.data.id;

      await Promise.all(
        validQuestions.map((question, index) =>
          api.post("/training/evaluation-questions/", {
            template: templateId,
            standard: question.standard || null,
            question: question.question,
            weight: Number(question.weight || 1),
            score_type: question.score_type,
            order: index + 1,
          })
        )
      );

      resetForm();
      await loadData();
    } catch (error) {
      console.error("Error creating template:", error);
      alert("Error creating template");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-44 rounded-[2rem] bg-slate-200" />
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
                <FileQuestion size={16} />
                Evaluation Builder
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Evaluation Templates
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Crea auditorías, evaluaciones y checklists dinámicos basados en estándares A&B.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 lg:min-w-80">
              <p className="text-sm font-semibold text-white/60">
                Current Template Questions
              </p>
              <p className="mt-2 text-5xl font-black">{questions.length}</p>
              <p className="mt-1 text-sm text-white/60">
                Total weight: {totalWeight}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Templates" value={templates.length} icon={<Layers3 />} />
          <SummaryCard title="Active" value={activeTemplates} icon={<BadgeCheck />} />
          <SummaryCard title="Inactive" value={inactiveTemplates} icon={<XCircle />} />
          <SummaryCard title="Standards" value={standards.length} icon={<FileQuestion />} />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Create Template
              </h2>
              <p className="text-sm text-slate-500">
                Define el nombre, descripción y preguntas que se usarán en evaluaciones.
              </p>
            </div>

            <label className="flex w-fit cursor-pointer items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-4 w-4 accent-slate-950"
              />
              <span className="font-bold text-slate-700">Active template</span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              required
              label="Template Name"
              placeholder="Guest Service Audit"
              value={form.name}
              onChange={(value) => setForm({ ...form, name: value })}
            />

            <label className="space-y-2 md:row-span-2">
              <span className="text-sm font-bold text-slate-700">
                Description
              </span>

              <textarea
                className="min-h-[132px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="Describe what this template evaluates..."
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: e.target.value,
                  })
                }
              />
            </label>
          </div>

          <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
            <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h3 className="text-xl font-black text-slate-950">Questions</h3>
                <p className="text-sm text-slate-500">
                  Agrega preguntas, conecta estándares y define el tipo de respuesta.
                </p>
              </div>

              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 font-black text-white transition hover:bg-slate-800"
              >
                <PlusCircle size={18} />
                Add Question
              </button>
            </div>

            <div className="space-y-4">
              {questions.map((question, index) => (
                <QuestionCard
                  key={index}
                  index={index}
                  question={question}
                  standards={standards}
                  canRemove={questions.length > 1}
                  onRemove={() => removeQuestion(index)}
                  onUpdate={(field, value) =>
                    updateQuestion(index, field, value)
                  }
                />
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              disabled={saving}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-950 px-6 py-3 font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Template"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-100 px-6 py-3 font-black text-slate-700 transition hover:bg-slate-200"
            >
              Clear
            </button>
          </div>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Existing Templates
              </h2>
              <p className="text-sm text-slate-500">
                Busca templates activos o inactivos.
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
                  placeholder="Search template..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredTemplates.length} de {templates.length} templates
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
              No templates found.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredTemplates.map((template) => (
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function QuestionCard({
  index,
  question,
  standards,
  canRemove,
  onRemove,
  onUpdate,
}: {
  index: number;
  question: QuestionForm;
  standards: Standard[];
  canRemove: boolean;
  onRemove: () => void;
  onUpdate: (field: keyof QuestionForm, value: string | number) => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Question {index + 1}
          </p>
          <p className="text-sm font-semibold text-slate-500">
            Weight {question.weight} · {formatScoreType(question.score_type)}
          </p>
        </div>

        <button
          type="button"
          disabled={!canRemove}
          onClick={onRemove}
          className="inline-flex items-center justify-center rounded-2xl bg-red-50 px-4 py-3 font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <label className="space-y-2 md:col-span-2">
          <span className="text-sm font-bold text-slate-700">Question</span>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="Question"
            value={question.question}
            onChange={(e) => onUpdate("question", e.target.value)}
          />
        </label>

        <Select
          label="Standard"
          value={question.standard}
          onChange={(value) => onUpdate("standard", value)}
        >
          <option value="">Select Standard</option>

          {standards.map((standard) => (
            <option key={standard.id} value={standard.id}>
              {standard.title}
            </option>
          ))}
        </Select>

        <Select
          label="Score Type"
          value={question.score_type}
          onChange={(value) => onUpdate("score_type", value)}
        >
          <option value="score">Score 1-10</option>
          <option value="yes_no">Yes / No</option>
          <option value="text">Text</option>
        </Select>

        <label className="space-y-2">
          <span className="text-sm font-bold text-slate-700">Weight</span>
          <input
            type="number"
            min={1}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            value={question.weight}
            onChange={(e) => onUpdate("weight", Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );
}

function TemplateCard({ template }: { template: EvaluationTemplate }) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-slate-950">
            {template.name}
          </h3>

          <p className="mt-2 text-sm leading-6 text-slate-500">
            {template.description || "No description."}
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${
            template.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {template.active ? "ACTIVE" : "INACTIVE"}
        </span>
      </div>
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
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        required={required}
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

function formatScoreType(value: string) {
  if (value === "yes_no") return "Yes / No";
  if (value === "text") return "Text";
  return "Score 1-10";
}