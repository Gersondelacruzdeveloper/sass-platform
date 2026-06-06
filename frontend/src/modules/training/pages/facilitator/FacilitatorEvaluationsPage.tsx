import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  ClipboardCheck,
  FileQuestion,
  Save,
  Star,
} from "lucide-react";

import api from "../../../../api/axios";
import type { Employee } from "../../types/training";

type EvaluationQuestion = {
  id: number;
  question: string;
  standard: number | null;
  standard_title?: string;
  score_type: "score" | "yes_no" | "text";
  weight: number;
  order: number;
};

type EvaluationTemplate = {
  id: number;
  name: string;
  description: string;
  active: boolean;
  questions: EvaluationQuestion[];
};

type AnswerForm = {
  question: number;
  score: number;
  yes_no_answer: boolean | null;
  text_answer: string;
};

export default function FacilitatorEvaluationsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<EvaluationTemplate[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    employee: "",
    template: "",
    notes: "",
  });

  const [answers, setAnswers] = useState<Record<number, AnswerForm>>({});

  async function loadData() {
    const [employeesRes, templatesRes] = await Promise.all([
      api.get("/training/employees/"),
      api.get("/training/evaluation-templates/"),
    ]);

    setEmployees(employeesRes.data);
    setTemplates(
      templatesRes.data.filter(
        (template: EvaluationTemplate) => template.active,
      ),
    );
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedTemplate = useMemo(() => {
    return templates.find((template) => String(template.id) === form.template);
  }, [templates, form.template]);

  const selectedQuestions = useMemo(() => {
    return [...(selectedTemplate?.questions || [])].sort(
      (a, b) => a.order - b.order,
    );
  }, [selectedTemplate]);

  const totalWeight = selectedQuestions.reduce(
    (total, question) => total + Number(question.weight || 0),
    0,
  );

  function handleTemplateChange(templateId: string) {
    setForm({ ...form, template: templateId });

    const template = templates.find((item) => String(item.id) === templateId);

    const initialAnswers: Record<number, AnswerForm> = {};

    template?.questions?.forEach((question) => {
      initialAnswers[question.id] = {
        question: question.id,
        score: 5,
        yes_no_answer: null,
        text_answer: "",
      };
    });

    setAnswers(initialAnswers);
  }

  function updateAnswer(
    questionId: number,
    field: keyof AnswerForm,
    value: string | number | boolean | null,
  ) {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        question: questionId,
        [field]: value,
      },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!selectedQuestions.length) {
      alert("This template has no questions.");
      return;
    }

    try {
      setSaving(true);

      const evaluationRes = await api.post("/training/employee-evaluations/", {
        employee: Number(form.employee),
        template: Number(form.template),
        notes: form.notes,
      });

      const evaluationId = evaluationRes.data.id;

      await Promise.all(
        selectedQuestions.map((question) => {
          const answer = answers[question.id];

          return api.post("/training/evaluation-answers/", {
            evaluation: evaluationId,
            question: question.id,
            score:
              question.score_type === "score"
                ? Number(answer?.score || 0)
                : 0,
            yes_no_answer:
              question.score_type === "yes_no"
                ? answer?.yes_no_answer
                : null,
            text_answer:
              question.score_type === "text" ? answer?.text_answer || "" : "",
          });
        }),
      );

      setForm({
        employee: "",
        template: "",
        notes: "",
      });

      setAnswers({});

      alert("Evaluation created.");
    } catch (error) {
      console.error("Error creating evaluation:", error);
      alert("Error creating evaluation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                <ClipboardCheck size={16} />
                Facilitator Evaluation
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Create Evaluation
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Select an assigned employee, choose a template, score each
                question, and save coaching notes.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 lg:min-w-80">
              <p className="text-sm font-semibold text-white/60">
                Selected Questions
              </p>
              <p className="mt-2 text-5xl font-black">
                {selectedQuestions.length}
              </p>
              <p className="mt-1 text-sm text-white/60">
                Total weight: {totalWeight}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Assigned Employees"
            value={employees.length}
            icon={<BadgeCheck />}
          />

          <SummaryCard
            title="Active Templates"
            value={templates.length}
            icon={<FileQuestion />}
          />

          <SummaryCard
            title="Questions"
            value={selectedQuestions.length}
            icon={<Star />}
          />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5">
            <h2 className="text-2xl font-black text-slate-950">
              Evaluation Details
            </h2>

            <p className="text-sm text-slate-500">
              Choose the employee and the evaluation template first.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="Employee"
              value={form.employee}
              onChange={(value) => setForm({ ...form, employee: value })}
              required
            >
              <option value="">Select employee</option>

              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} — {employee.position}
                </option>
              ))}
            </Select>

            <Select
              label="Template"
              value={form.template}
              onChange={handleTemplateChange}
              required
            >
              <option value="">Select template</option>

              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </Select>
          </div>

          {selectedTemplate && (
            <section className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
              <div className="mb-5">
                <h3 className="text-2xl font-black text-slate-950">
                  {selectedTemplate.name}
                </h3>

                <p className="mt-1 text-sm text-slate-500">
                  {selectedTemplate.description || "No description."}
                </p>
              </div>

              <div className="space-y-4">
                {selectedQuestions.map((question, index) => (
                  <QuestionAnswerCard
                    key={question.id}
                    index={index}
                    question={question}
                    answer={answers[question.id]}
                    onUpdate={(field, value) =>
                      updateAnswer(question.id, field, value)
                    }
                  />
                ))}
              </div>
            </section>
          )}

          <label className="mt-5 block space-y-2">
            <span className="text-sm font-bold text-slate-700">
              General Notes
            </span>

            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="General observations, service behavior, customer interaction, training needs..."
              className="min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </label>

          <button
            disabled={saving}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 disabled:opacity-50 md:w-auto"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save Evaluation"}
          </button>
        </form>
      </div>
    </div>
  );
}

function QuestionAnswerCard({
  index,
  question,
  answer,
  onUpdate,
}: {
  index: number;
  question: EvaluationQuestion;
  answer?: AnswerForm;
  onUpdate: (
    field: keyof AnswerForm,
    value: string | number | boolean | null,
  ) => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          Question {index + 1}
        </p>

        <h4 className="mt-1 text-lg font-black text-slate-950">
          {question.question}
        </h4>

        <p className="mt-1 text-sm text-slate-500">
          {question.standard_title || "No standard"} · Weight {question.weight}
        </p>
      </div>

      {question.score_type === "score" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-slate-700">
              Score 1-10
            </span>

            <span className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
              {answer?.score || 5}/10
            </span>
          </div>

          <input
            required
            type="range"
            min={1}
            max={10}
            step={1}
            value={answer?.score || 5}
            onChange={(e) => onUpdate("score", Number(e.target.value))}
            className="w-full cursor-pointer accent-slate-950"
          />

          <div className="flex justify-between text-xs font-bold text-slate-400">
            <span>1</span>
            <span>5</span>
            <span>10</span>
          </div>
        </div>
      )}

      {question.score_type === "yes_no" && (
        <Select
          label="Answer"
          value={
            answer?.yes_no_answer === true
              ? "yes"
              : answer?.yes_no_answer === false
                ? "no"
                : ""
          }
          onChange={(value) => onUpdate("yes_no_answer", value === "yes")}
          required
        >
          <option value="">Select answer</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </Select>
      )}

      {question.score_type === "text" && (
        <label className="space-y-2">
          <span className="text-sm font-bold text-slate-700">Notes</span>

          <textarea
            required
            rows={4}
            value={answer?.text_answer || ""}
            onChange={(e) => onUpdate("text_answer", e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
          />
        </label>
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