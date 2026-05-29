import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ClipboardCheck,
  FileCheck2,
  Search,
  Star,
  Users,
} from "lucide-react";
import api from "../../../api/axios";
import type {
  Employee,
  EmployeeEvaluation,
  EvaluationQuestion,
  EvaluationTemplate,
} from "../types/training";

type AnswerValue = number | boolean | string;

export default function EvaluationsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [evaluations, setEvaluations] = useState<EmployeeEvaluation[]>([]);

  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [answers, setAnswers] = useState<Record<number, AnswerValue>>({});
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      setLoading(true);

      const [employeesRes, templatesRes, evaluationsRes] = await Promise.all([
        api.get("/training/employees/"),
        api.get("/training/evaluation-templates/"),
        api.get("/training/employee-evaluations/"),
      ]);

      setEmployees(employeesRes.data);
      setTemplates(templatesRes.data);
      setEvaluations(evaluationsRes.data);
    } catch (error) {
      console.error("Error loading evaluations:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedTemplateData = useMemo(() => {
    return templates.find((template) => template.id === Number(selectedTemplate));
  }, [templates, selectedTemplate]);

  const questions = selectedTemplateData?.questions || [];

  const answeredCount = questions.filter((question) => {
    const value = answers[question.id];
    return value !== undefined && value !== "";
  }).length;

  const progress = questions.length
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;

  const averageFinalScore = getAverage(
    evaluations.map((evaluation) => Number(evaluation.final_score || 0))
  );

  const filteredEvaluations = useMemo(() => {
    return evaluations.filter((evaluation) => {
      const value = `
        ${evaluation.employee_name || ""}
        ${evaluation.template_name || ""}
        ${evaluation.notes || ""}
        ${evaluation.final_score || ""}
      `.toLowerCase();

      return value.includes(search.toLowerCase());
    });
  }, [evaluations, search]);

  function updateAnswer(questionId: number, value: AnswerValue) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  }

  function resetForm() {
    setSelectedEmployee("");
    setSelectedTemplate("");
    setAnswers({});
    setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedEmployee || !selectedTemplate) {
      alert("Please select employee and template.");
      return;
    }

    if (!questions.length) {
      alert("This template has no questions.");
      return;
    }

    try {
      setSaving(true);

      const evaluationRes = await api.post("/training/employee-evaluations/", {
        employee: Number(selectedEmployee),
        template: Number(selectedTemplate),
        notes,
      });

      const evaluationId = evaluationRes.data.id;

      await Promise.all(
        questions.map((question) => {
          const value = answers[question.id];

          const payload: any = {
            evaluation: evaluationId,
            question: question.id,
            score: 0,
            text_answer: "",
            yes_no_answer: null,
          };

          if (question.score_type === "score") {
            payload.score = Number(value || 0);
          }

          if (question.score_type === "yes_no") {
            payload.yes_no_answer = value === true;
            payload.score = value === true ? 10 : 0;
          }

          if (question.score_type === "text") {
            payload.text_answer = String(value || "");
          }

          return api.post("/training/evaluation-answers/", payload);
        })
      );

      resetForm();
      await loadData();
    } catch (error) {
      console.error("Error saving evaluation:", error);
      alert("Could not save evaluation.");
    } finally {
      setSaving(false);
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
                <ClipboardCheck size={16} />
                Evaluation Center
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Dynamic Evaluations
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Evalúa colaboradores por templates, mide estándares, detecta oportunidades y genera seguimiento rápido para facilitadores y gerentes.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5">
              <p className="text-sm font-semibold text-white/60">
                Average Evaluation Score
              </p>
              <p className="mt-2 text-4xl font-black">{averageFinalScore}%</p>
              <p className="mt-1 text-sm text-white/60">
                basado en {evaluations.length} evaluaciones
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Templates" value={templates.length} icon={<FileCheck2 />} />
          <StatCard title="Active Templates" value={templates.filter((t) => t.active).length} icon={<BadgeCheck />} />
          <StatCard title="Evaluations" value={evaluations.length} icon={<ClipboardCheck />} />
          <StatCard title="Employees" value={employees.length} icon={<Users />} />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                New Employee Evaluation
              </h2>
              <p className="text-sm text-slate-500">
                Selecciona empleado, template y completa las preguntas.
              </p>
            </div>

            <div className="rounded-3xl bg-slate-50 p-4 lg:min-w-64">
              <div className="mb-2 flex justify-between text-sm font-bold text-slate-600">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>

              <div className="h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-slate-950"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="mt-2 text-xs font-semibold text-slate-500">
                {answeredCount} of {questions.length} questions answered
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="Empleado"
              value={selectedEmployee}
              onChange={setSelectedEmployee}
              required
            >
              <option value="">Seleccionar empleado</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} — {employee.position}
                </option>
              ))}
            </Select>

            <Select
              label="Template"
              value={selectedTemplate}
              required
              onChange={(value) => {
                setSelectedTemplate(value);
                setAnswers({});
              }}
            >
              <option value="">Seleccionar template</option>
              {templates
                .filter((template) => template.active)
                .map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
            </Select>
          </div>

          {selectedTemplateData && (
            <div className="mt-5 rounded-[1.5rem] bg-slate-50 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-950">
                    {selectedTemplateData.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {selectedTemplateData.description || "No description."}
                  </p>
                </div>

                <span className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">
                  {questions.length} Questions
                </span>
              </div>
            </div>
          )}

          <div className="mt-5 space-y-4">
            {questions.length > 0 ? (
              questions.map((question, index) => (
                <QuestionInput
                  key={question.id}
                  question={question}
                  index={index}
                  value={answers[question.id]}
                  onChange={(value) => updateAnswer(question.id, value)}
                />
              ))
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
                Select a template to load evaluation questions.
              </div>
            )}
          </div>

          <textarea
            className="mt-5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="Notas generales de la evaluación..."
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button
              disabled={saving}
              className="min-h-12 rounded-2xl bg-slate-950 px-6 py-3 font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Evaluation"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="min-h-12 rounded-2xl bg-slate-100 px-6 py-3 font-black text-slate-700 transition hover:bg-slate-200"
            >
              Clear
            </button>
          </div>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Recent Evaluations
              </h2>
              <p className="text-sm text-slate-500">
                Busca por empleado, template, nota o score.
              </p>
            </div>

            <div className="relative lg:min-w-[360px]">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="Search evaluations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredEvaluations.length} de {evaluations.length} evaluaciones
          </div>

          {filteredEvaluations.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">No evaluations found.</p>
              <p className="mt-1 text-sm text-slate-500">
                Intenta cambiar la búsqueda.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredEvaluations.map((evaluation) => (
                <EvaluationCard key={evaluation.id} evaluation={evaluation} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EvaluationCard({
  evaluation,
}: {
  evaluation: EmployeeEvaluation;
}) {
  const score = Number(evaluation.final_score || 0);
  const scoreColor =
    score >= 85 ? "bg-emerald-500" : score >= 70 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xl font-black text-slate-950">
            {evaluation.employee_name || `Employee #${evaluation.employee}`}
          </p>

          <p className="mt-1 text-sm font-semibold text-slate-500">
            {evaluation.template_name || `Template #${evaluation.template}`}
          </p>

          <p className="mt-2 text-xs font-semibold text-slate-400">
            {new Date(evaluation.created_at).toLocaleString()}
          </p>
        </div>

        <div className="rounded-3xl bg-slate-950 px-5 py-4 text-center text-white">
          <p className="text-xs font-semibold text-white/60">Final Score</p>
          <p className="text-3xl font-black">{score}%</p>
        </div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${scoreColor}`}
          style={{ width: `${Math.min(score, 100)}%` }}
        />
      </div>

      {evaluation.notes && (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm text-slate-600">
          {evaluation.notes}
        </p>
      )}
    </div>
  );
}

function QuestionInput({
  question,
  index,
  value,
  onChange,
}: {
  question: EvaluationQuestion;
  index: number;
  value: AnswerValue | undefined;
  onChange: (value: AnswerValue) => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          Question {index + 1}
          {question.standard_title ? ` · ${question.standard_title}` : ""}
        </p>

        <h3 className="mt-1 font-black text-slate-950">
          {question.question}
        </h3>
      </div>

      {question.score_type === "score" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold text-slate-500">Score</span>
            <span className="rounded-full bg-slate-950 px-3 py-1 text-sm font-black text-white">
              {Number(value || 5)}/10
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={10}
            value={Number(value || 5)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-slate-950"
          />
        </div>
      )}

      {question.score_type === "yes_no" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-2xl px-4 py-3 font-black transition ${
              value === true
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Yes
          </button>

          <button
            type="button"
            onClick={() => onChange(false)}
            className={`rounded-2xl px-4 py-3 font-black transition ${
              value === false
                ? "bg-red-600 text-white"
                : "bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            No
          </button>
        </div>
      )}

      {question.score_type === "text" && (
        <textarea
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
          placeholder="Write answer..."
          rows={3}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function StatCard({
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

function Select({
  label,
  value,
  onChange,
  children,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        required={required}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function getAverage(values: number[]) {
  const cleanValues = values.filter((value) => value > 0);

  if (!cleanValues.length) return 0;

  const total = cleanValues.reduce((sum, value) => sum + value, 0);

  return Math.round(total / cleanValues.length);
}