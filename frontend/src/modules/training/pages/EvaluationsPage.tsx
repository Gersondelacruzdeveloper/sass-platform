import { useEffect, useMemo, useState } from "react";
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
    return <div className="p-4">Loading evaluations...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
          Dynamic Evaluations
        </h1>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">
          Evalúa según la necesidad actual del hotel usando templates y estándares.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard title="Templates" value={templates.length} />
        <StatCard title="Evaluations" value={evaluations.length} />
        <StatCard title="Employees" value={employees.length} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6"
      >
        <div className="mb-5">
          <h2 className="text-lg font-black text-slate-950">
            New Employee Evaluation
          </h2>
          <p className="text-sm text-slate-500">
            Selecciona el empleado y el tipo de evaluación que vas a aplicar.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <select
            required
            className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
          >
            <option value="">Seleccionar empleado</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name} — {employee.position}
              </option>
            ))}
          </select>

          <select
            required
            className="min-h-12 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-black"
            value={selectedTemplate}
            onChange={(e) => {
              setSelectedTemplate(e.target.value);
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
          </select>
        </div>

        {selectedTemplateData && (
          <div className="mt-4 rounded-3xl bg-slate-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-black text-slate-950">
                  {selectedTemplateData.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedTemplateData.description || "No description."}
                </p>
              </div>

              <span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">
                {questions.length} Questions
              </span>
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
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
            <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">
              Select a template to load evaluation questions.
            </div>
          )}
        </div>

        <textarea
          className="mt-4 w-full rounded-3xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-black"
          placeholder="Notas generales de la evaluación..."
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <button
            disabled={saving}
            className="min-h-12 rounded-2xl bg-black px-6 py-3 font-bold text-white disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Evaluation"}
          </button>

          <button
            type="button"
            onClick={resetForm}
            className="min-h-12 rounded-2xl bg-slate-100 px-6 py-3 font-bold text-slate-700"
          >
            Clear
          </button>
        </div>
      </form>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-black text-slate-950">
          Recent Evaluations
        </h2>

        <div className="space-y-3">
          {evaluations.length === 0 ? (
            <p className="text-sm text-slate-500">No evaluations yet.</p>
          ) : (
            evaluations.map((evaluation) => (
              <div
                key={evaluation.id}
                className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-black text-slate-950">
                      {evaluation.employee_name || `Employee #${evaluation.employee}`}
                    </p>
                    <p className="text-sm text-slate-500">
                      {evaluation.template_name || `Template #${evaluation.template}`}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(evaluation.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-black px-4 py-3 text-center text-white">
                    <p className="text-xs text-white/60">Final Score</p>
                    <p className="text-2xl font-black">
                      {evaluation.final_score}%
                    </p>
                  </div>
                </div>

                {evaluation.notes && (
                  <p className="mt-3 text-sm text-slate-600">
                    {evaluation.notes}
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
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <p className="text-xs font-bold uppercase text-slate-400">
          Question {index + 1}
          {question.standard_title ? ` · ${question.standard_title}` : ""}
        </p>
        <h3 className="mt-1 font-black text-slate-950">{question.question}</h3>
      </div>

      {question.score_type === "score" && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">
              Score
            </span>
            <span className="rounded-full bg-black px-3 py-1 text-sm font-black text-white">
              {Number(value || 5)}/10
            </span>
          </div>

          <input
            type="range"
            min={1}
            max={10}
            value={Number(value || 5)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full"
          />
        </div>
      )}

      {question.score_type === "yes_no" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-2xl px-4 py-3 font-bold ${
              value === true
                ? "bg-green-600 text-white"
                : "bg-green-50 text-green-700"
            }`}
          >
            Yes
          </button>

          <button
            type="button"
            onClick={() => onChange(false)}
            className={`rounded-2xl px-4 py-3 font-bold ${
              value === false
                ? "bg-red-600 text-white"
                : "bg-red-50 text-red-700"
            }`}
          >
            No
          </button>
        </div>
      )}

      {question.score_type === "text" && (
        <textarea
          className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-black"
          placeholder="Write answer..."
          rows={3}
          value={String(value || "")}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}