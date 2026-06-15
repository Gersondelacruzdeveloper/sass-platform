import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardCheck } from "lucide-react";

import api from "../../../api/axios";
import { getEmployee } from "../api/trainingApi";
import type { Employee } from "../types/training";

type EvaluationAnswer = {
  id: number;
  question: number;
  question_text?: string;
  standard_title?: string;
  score: number;
  text_answer: string;
  yes_no_answer: boolean | null;
};

type EmployeeEvaluation = {
  id: number;
  employee: number;
  employee_name?: string;
  template: number;
  template_name?: string;
  evaluator_name?: string;
  notes: string;
  created_at: string;
  answers: EvaluationAnswer[];
};

export default function EmployeeDetailPage() {
  const { id, organisationSlug } = useParams();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [evaluations, setEvaluations] = useState<EmployeeEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    if (!id) return;

    setLoading(true);

    const [employeeData, evaluationsRes] = await Promise.all([
      getEmployee(Number(id)),
      api.get(`/training/employee-evaluations/?employee=${id}`),
    ]);

    setEmployee(employeeData);
    setEvaluations(evaluationsRes.data);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [id]);

  const latestEvaluationScore = useMemo(() => {
    if (!evaluations.length) return 0;
    return getEvaluationScore(evaluations[0]);
  }, [evaluations]);

  const averageEvaluationScore = useMemo(() => {
    if (!evaluations.length) return 0;

    const total = evaluations.reduce(
      (sum, evaluation) => sum + getEvaluationScore(evaluation),
      0,
    );

    return Math.round(total / evaluations.length);
  }, [evaluations]);

  if (loading || !employee) {
    return <div className="p-6">Loading employee profile...</div>;
  }


return (
  <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <Link
        to={`/training/${organisationSlug}/employees`}
        className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-950"
      >
        <ArrowLeft size={17} />
        Volver a Empleados
      </Link>

      <div className="overflow-hidden rounded-[2rem] bg-white shadow-sm ring-1 ring-slate-200">
        <div className="bg-slate-950 p-6 text-white md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-5">
              {employee.photo ? (
                <img
                  src={employee.photo}
                  className="h-24 w-24 rounded-3xl border-4 border-white/20 object-cover md:h-28 md:w-28"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/10 text-5xl font-black md:h-28 md:w-28">
                  {employee.name[0]}
                </div>
              )}

              <div>
                <h1 className="text-3xl font-black md:text-5xl">
                  {employee.name}
                </h1>

                <p className="mt-1 text-white/70">
                  {employee.position} · {employee.outlet_name || "Sin outlet"}
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge>{employee.potential_level.replace("_", " ")}</Badge>
                  {employee.promotion_ready && <Badge>Listo para Promoción</Badge>}
                  <Badge>{employee.active ? "Activo" : "Inactivo"}</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-3xl bg-white/10 p-6 text-center backdrop-blur">
              <p className="text-sm font-bold text-white/60">
                Promedio
              </p>

              <p className="text-5xl font-black">
                {averageEvaluationScore}%
              </p>

              <p className="mt-1 text-xs text-white/50">
                {evaluations.length} evaluaciones completadas
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 p-5 md:p-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <ScoreCard title="Evaluaciones" value={evaluations.length} suffix="" />
              <ScoreCard title="Promedio" value={averageEvaluationScore} suffix="%" />
              <ScoreCard title="Última Puntuación" value={latestEvaluationScore} suffix="%" />
              <ScoreCard title="Estándar HR" value={employee.hard_rock_standard_score} suffix="%" />
            </div>

            <Section title="Desglose de Competencias">
              <div className="space-y-4">
                <CompetencyBar title="Servicio" value={employee.service_score} />
                <CompetencyBar title="Liderazgo" value={employee.leadership_score} />
                <CompetencyBar title="Actitud" value={employee.attitude_score} />
                <CompetencyBar title="Venta Sugestiva" value={employee.upselling_score} />
              </div>
            </Section>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <InfoCard title="Fortalezas" items={employee.strengths} positive />
              <InfoCard title="Áreas de Mejora" items={employee.weaknesses} />
            </div>

            <Section title="Evaluaciones Recientes por Plantilla">
              {evaluations.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Todavía no se han encontrado evaluaciones por plantilla para este empleado.
                </p>
              ) : (
                <div className="space-y-4">
                  {evaluations.map((evaluation) => {
                    const score = getEvaluationScore(evaluation);

                    return (
                      <div
                        key={evaluation.id}
                        className="rounded-3xl border border-slate-200 bg-slate-50 p-5"
                      >
                        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                          <div>
                            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600">
                              <ClipboardCheck size={14} />
                              {evaluation.template_name || "Evaluación"}
                            </div>

                            <p className="text-sm font-semibold text-slate-500">
                              {formatDate(evaluation.created_at)}
                            </p>

                            {evaluation.evaluator_name && (
                              <p className="mt-1 text-sm text-slate-500">
                                Evaluado por: {evaluation.evaluator_name}
                              </p>
                            )}

                            {evaluation.notes && (
                              <p className="mt-3 text-sm leading-6 text-slate-600">
                                {evaluation.notes}
                              </p>
                            )}
                          </div>

                          <div className="rounded-3xl bg-slate-950 px-5 py-4 text-center text-white">
                            <p className="text-xs font-bold text-white/60">
                              Puntuación Final
                            </p>
                            <p className="text-3xl font-black">{score}%</p>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          {evaluation.answers?.map((answer) => (
                            <div
                              key={answer.id}
                              className="rounded-2xl bg-white p-4"
                            >
                              <p className="text-sm font-black text-slate-950">
                                {answer.question_text ||
                                  `Pregunta #${answer.question}`}
                              </p>

                              {answer.standard_title && (
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                  Estándar: {answer.standard_title}
                                </p>
                              )}

                              <p className="mt-2 text-sm font-bold text-slate-700">
                                {formatAnswer(answer)}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section title="Notas del Gerente">
              <p className="text-slate-600">
                {employee.notes || "Todavía no se han agregado notas."}
              </p>
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Detalles del Perfil">
              <Detail label="Código de Empleado" value={employee.employee_code || "N/A"} />
              <Detail label="Departamento" value={employee.department} />
              <Detail label="Supervisor" value={employee.supervisor_name || "Sin supervisor"} />
              <Detail label="Fecha de Contratación" value={employee.hire_date || "Sin fecha de contratación"} />
              <Detail label="Meta Profesional" value={employee.career_goal || "Sin meta profesional"} />
            </Section>

            <Section title="Idiomas">
              <div className="flex flex-wrap gap-2">
                {employee.languages?.length ? (
                  employee.languages.map((lang) => (
                    <span
                      key={lang}
                      className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700"
                    >
                      {lang}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No se han agregado idiomas.</p>
                )}
              </div>
            </Section>

            <Section title="Recomendación de Crecimiento">
              <p className="text-sm text-slate-600">
                {averageEvaluationScore >= 85
                  ? "Candidato fuerte para reconocimiento, mentoría o futuro liderazgo."
                  : averageEvaluationScore >= 70
                    ? "Buen desempeño. Continuar desarrollando consistencia y estándares."
                    : evaluations.length === 0
                      ? "Aún no hay evaluaciones. Complete la primera evaluación para generar una recomendación."
                      : "Necesita plan de coaching, observación y evaluación de seguimiento."}
              </p>
            </Section>
          </div>
        </div>
      </div>
    </div>
  </div>
);


}

function getEvaluationScore(evaluation: EmployeeEvaluation) {
  const scoreAnswers =
    evaluation.answers?.filter((answer) => Number(answer.score) > 0) || [];

  if (!scoreAnswers.length) return 0;

  const total = scoreAnswers.reduce(
    (sum, answer) => sum + Number(answer.score || 0),
    0,
  );

  const max = scoreAnswers.length * 10;

  return Math.round((total / max) * 100);
}

function formatAnswer(answer: EvaluationAnswer) {
  if (answer.text_answer) return answer.text_answer;
  if (answer.yes_no_answer === true) return "Yes";
  if (answer.yes_no_answer === false) return "No";

  if (Number(answer.score) > 0) {
    return `Score: ${answer.score}/10`;
  }

  return "No answer.";
}

function formatDate(value: string) {
  if (!value) return "No date";
  return new Date(value).toLocaleString();
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase text-white">
      {children}
    </span>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-black text-slate-950">{title}</h2>
      {children}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-slate-800">{value}</p>
    </div>
  );
}

function ScoreCard({
  title,
  value,
  suffix = "%",
}: {
  title: string;
  value: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-500">{title}</p>

      <p className="mt-2 text-2xl font-black text-slate-950">
        {value}
        {suffix}
      </p>

      {suffix === "%" && (
        <div className="mt-3 h-2 rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-slate-950"
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function CompetencyBar({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-slate-700">{title}</span>
        <span className="font-black text-slate-950">{value}%</span>
      </div>

      <div className="h-3 rounded-full bg-slate-100">
        <div
          className="h-3 rounded-full bg-slate-950 transition-all"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  );
}

function InfoCard({
  title,
  items,
  positive,
}: {
  title: string;
  items: string[];
  positive?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-black text-slate-950">{title}</h2>

      <div className="flex flex-wrap gap-2">
        {items?.length ? (
          items.map((item) => (
            <span
              key={item}
              className={`rounded-full px-3 py-1 text-sm font-bold ${
                positive
                  ? "bg-green-50 text-green-700"
                  : "bg-orange-50 text-orange-700"
              }`}
            >
              {item}
            </span>
          ))
        ) : (
          <p className="text-sm text-slate-500">No items added yet.</p>
        )}
      </div>
    </div>
  );
}