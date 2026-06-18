import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  RefreshCcw,
  ShieldAlert,
  Target,
  UserRound,
} from "lucide-react";

import api from "../../../api/axios";
import { getEmployee } from "../api/trainingApi";
import { assignedTrainingsApi } from "../api/trainingRecoveryApi";

import type {
  Employee,
  EmployeeAssignedTraining,
} from "../types/training";

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
  final_score?: number;
  answers: EvaluationAnswer[];
};

type FailedStandard = {
  name: string;
  count: number;
  averageScore: number;
};

type TimelineItem = {
  id: string;
  date: string;
  title: string;
  description: string;
  type: "evaluation" | "training" | "completed" | "reevaluation" | "closed";
};

export default function EmployeeDetailPage() {
  const params = useParams();
  const organisationSlug = params.organisationSlug || "";
  const employeeId = params.employeeId || params.id;

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [evaluations, setEvaluations] = useState<EmployeeEvaluation[]>([]);
  const [assignedTrainings, setAssignedTrainings] = useState<EmployeeAssignedTraining[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    if (!employeeId) return;

    try {
      setLoading(true);

      const [employeeData, evaluationsRes, assignedTrainingsRes] =
        await Promise.all([
          getEmployee(Number(employeeId)),
          api.get<EmployeeEvaluation[]>(
            `/training/employee-evaluations/?employee=${employeeId}`,
          ),
          assignedTrainingsApi.list({ employee: employeeId }),
        ]);

      setEmployee(employeeData);
      setEvaluations(evaluationsRes.data);
      setAssignedTrainings(assignedTrainingsRes.data);
    } catch (error) {
      console.error("Error loading employee profile:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [employeeId]);



  const averageEvaluationScore = useMemo(() => {
    if (!evaluations.length) return 0;

    const total = evaluations.reduce(
      (sum, evaluation) => sum + getEvaluationScore(evaluation),
      0,
    );

    return Math.round(total / evaluations.length);
  }, [evaluations]);

  const openTrainings = assignedTrainings.filter(
    (item) => item.status !== "closed",
  );

  const completedTrainings = assignedTrainings.filter(
    (item) => item.status === "closed",
  );

  const reevaluationPending = assignedTrainings.filter(
    (item) => item.status === "reevaluation_pending",
  );

  const failedStandards = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number }>();

    evaluations.forEach((evaluation) => {
      evaluation.answers?.forEach((answer) => {
        const score = Number(answer.score || 0);
        const standard = answer.standard_title;

        if (!standard || score <= 0 || score >= 7) return;

        const current = grouped.get(standard) || { total: 0, count: 0 };
        current.total += score;
        current.count += 1;
        grouped.set(standard, current);
      });
    });

    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        count: value.count,
        averageScore: Math.round((value.total / value.count) * 10),
      }))
      .sort((a, b) => a.averageScore - b.averageScore);
  }, [evaluations]);

  const timeline = useMemo(() => {
    const items: TimelineItem[] = [];

    evaluations.forEach((evaluation) => {
      items.push({
        id: `evaluation-${evaluation.id}`,
        date: evaluation.created_at,
        title: "Evaluación realizada",
        description: `${evaluation.template_name || "Evaluación"} · Score ${getEvaluationScore(
          evaluation,
        )}%`,
        type: "evaluation",
      });
    });

    assignedTrainings.forEach((training) => {
      items.push({
        id: `training-${training.id}`,
        date: training.assigned_at || "",
        title: "Refuerzo asignado",
        description: `${training.standard_title || "Estándar"} · ${
          training.resource_title || "Recurso visual"
        }`,
        type: "training",
      });

      if (training.completed_at) {
        items.push({
          id: `completed-${training.id}`,
          date: training.completed_at,
          title: "Microtraining completado",
          description: training.standard_title || "Refuerzo completado",
          type: "completed",
        });
      }

      if (training.reevaluation_due_date) {
        items.push({
          id: `reevaluation-${training.id}`,
          date: training.reevaluation_due_date,
          title: "Reevaluación programada",
          description: training.standard_title || "Pendiente de reevaluación",
          type: "reevaluation",
        });
      }

      if (training.reevaluated_at) {
        items.push({
          id: `closed-${training.id}`,
          date: training.reevaluated_at,
          title: "Seguimiento cerrado",
          description: training.supervisor_notes || "Caso cerrado después de seguimiento.",
          type: "closed",
        });
      }
    });

    return items.sort(
      (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime(),
    );
  }, [evaluations, assignedTrainings]);

  if (loading || !employee) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-36 rounded-[2rem] bg-slate-200" />
          <div className="h-96 rounded-[2rem] bg-slate-200" />
        </div>
      </div>
    );
  }

  const operationalStatus = getOperationalStatus(
    averageEvaluationScore,
    openTrainings.length,
    reevaluationPending.length,
    evaluations.length,
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <Link
          to={`/training/${organisationSlug}/employees`}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-950"
        >
          <ArrowLeft size={17} />
          Volver a Colaboradores
        </Link>

        <section className="overflow-hidden rounded-[2rem] bg-slate-950 text-white shadow-xl">
          <div className="p-6 md:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                {employee.photo ? (
                  <img
                    src={employee.photo}
                    alt={employee.name}
                    className="h-28 w-28 rounded-[2rem] border-4 border-white/15 object-cover shadow-lg"
                  />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-[2rem] bg-white/10 text-5xl font-black">
                    {employee.name?.[0] || "C"}
                  </div>
                )}

                <div>
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white/80">
                    <UserRound size={16} />
                    Perfil de desempeño A&B
                  </div>

                  <h1 className="text-3xl font-black md:text-5xl">
                    {employee.name}
                  </h1>

                  <p className="mt-2 text-white/70">
                    {employee.position} · {employee.outlet_name || "Sin outlet"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <HeaderBadge>{employee.active ? "Activo" : "Inactivo"}</HeaderBadge>
                    <HeaderBadge>{employee.department || "A&B"}</HeaderBadge>
                    {employee.supervisor_name && (
                      <HeaderBadge>Supervisor: {employee.supervisor_name}</HeaderBadge>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:min-w-[440px]">
                <HeroMetric
                  label="Score General"
                  value={`${averageEvaluationScore}%`}
                  status={operationalStatus.label}
                />
                <HeroMetric
                  label="Estado Operativo"
                  value={operationalStatus.shortLabel}
                  status={operationalStatus.helper}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <ScoreCard
            title="Evaluaciones"
            value={evaluations.length}
            suffix=""
            icon={<ClipboardCheck />}
          />
          <ScoreCard
            title="Promedio"
            value={averageEvaluationScore}
            suffix="%"
            icon={<Target />}
          />
          <ScoreCard
            title="Refuerzos abiertos"
            value={openTrainings.length}
            suffix=""
            icon={<ShieldAlert />}
          />
          <ScoreCard
            title="Reevaluaciones"
            value={reevaluationPending.length}
            suffix=""
            icon={<RefreshCcw />}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="space-y-6 xl:col-span-2">
            <Section title="Centro de Microtraining">
              {assignedTrainings.length === 0 ? (
                <EmptyState text="Este colaborador todavía no tiene refuerzos asignados." />
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <MiniStatusCard
                    title="Asignados"
                    value={assignedTrainings.length}
                    helper="Total histórico"
                  />
                  <MiniStatusCard
                    title="Abiertos"
                    value={openTrainings.length}
                    helper="Requieren acción"
                  />
                  <MiniStatusCard
                    title="Completados"
                    value={completedTrainings.length}
                    helper="Cerrados"
                  />
                </div>
              )}

              <div className="mt-5 space-y-3">
                {assignedTrainings.slice(0, 5).map((training) => (
                  <TrainingFollowUpRow key={training.id} training={training} />
                ))}
              </div>
            </Section>

            <Section title="Estándares que requieren refuerzo">
              {failedStandards.length === 0 ? (
                <EmptyState text="No hay estándares fallados detectados en las evaluaciones actuales." />
              ) : (
                <div className="space-y-3">
                  {failedStandards.slice(0, 6).map((standard) => (
                    <FailedStandardRow key={standard.name} standard={standard} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Timeline de desarrollo">
              {timeline.length === 0 ? (
                <EmptyState text="Todavía no hay historial de evaluaciones o refuerzos." />
              ) : (
                <div className="space-y-3">
                  {timeline.slice(0, 10).map((item) => (
                    <TimelineRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </Section>

            <Section title="Evaluaciones recientes">
              {evaluations.length === 0 ? (
                <EmptyState text="Todavía no hay evaluaciones registradas para este colaborador." />
              ) : (
                <div className="space-y-4">
                  {evaluations.map((evaluation) => (
                    <EvaluationCard key={evaluation.id} evaluation={evaluation} />
                  ))}
                </div>
              )}
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Detalles operativos">
              <Detail label="Código" value={employee.employee_code || "N/A"} />
              <Detail label="Departamento" value={employee.department || "A&B"} />
              <Detail label="Outlet" value={employee.outlet_name || "Sin outlet"} />
              <Detail label="Posición" value={employee.position || "Sin posición"} />
              <Detail
                label="Supervisor"
                value={employee.supervisor_name || "Sin supervisor"}
              />
              <Detail
                label="Fecha ingreso"
                value={employee.hire_date || "Sin fecha"}
              />
            </Section>

            <Section title="Estado operativo">
              <div
                className={`rounded-3xl border p-5 ${operationalStatus.bg} ${operationalStatus.border}`}
              >
                <p className={`text-lg font-black ${operationalStatus.color}`}>
                  {operationalStatus.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {operationalStatus.recommendation}
                </p>
              </div>
            </Section>

            <Section title="Notas operativas">
              <p className="text-sm leading-6 text-slate-600">
                {employee.notes || "Todavía no se han agregado notas operativas."}
              </p>
            </Section>
          </div>
        </section>
      </div>
    </div>
  );
}

function getEvaluationScore(evaluation: EmployeeEvaluation) {
  if (Number(evaluation.final_score || 0) > 0) {
    return Math.round(Number(evaluation.final_score));
  }

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
  if (answer.yes_no_answer === true) return "Sí";
  if (answer.yes_no_answer === false) return "No";

  if (Number(answer.score) > 0) {
    return `Score: ${answer.score}/10`;
  }

  return "Sin respuesta";
}

function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString();
}

function getOperationalStatus(
  averageScore: number,
  openTrainings: number,
  reevaluationPending: number,
  evaluationsCount: number,
) {
  if (!evaluationsCount) {
    return {
      label: "Pendiente de diagnóstico",
      shortLabel: "Pendiente",
      helper: "Sin evaluaciones",
      recommendation:
        "Realizar una primera evaluación para generar indicadores y necesidades de refuerzo.",
      bg: "bg-slate-50",
      border: "border-slate-200",
      color: "text-slate-700",
    };
  }

  if (reevaluationPending > 0) {
    return {
      label: "Requiere reevaluación",
      shortLabel: "Reevaluar",
      helper: `${reevaluationPending} pendiente(s)`,
      recommendation:
        "Observar nuevamente en operación y cerrar el seguimiento si el estándar fue corregido.",
      bg: "bg-amber-50",
      border: "border-amber-100",
      color: "text-amber-700",
    };
  }

  if (openTrainings > 0) {
    return {
      label: "En seguimiento",
      shortLabel: "Seguimiento",
      helper: `${openTrainings} refuerzo(s)`,
      recommendation:
        "Completar los microtrainings asignados antes de la próxima observación.",
      bg: "bg-orange-50",
      border: "border-orange-100",
      color: "text-orange-700",
    };
  }

  if (averageScore >= 85) {
    return {
      label: "Excelente desempeño",
      shortLabel: "Excelente",
      helper: "Sin refuerzos abiertos",
      recommendation:
        "Mantener consistencia y considerar como ejemplo positivo para roleplay o mentoría.",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      color: "text-emerald-700",
    };
  }

  if (averageScore >= 70) {
    return {
      label: "Desempeño estable",
      shortLabel: "Estable",
      helper: "Monitorear",
      recommendation:
        "Continuar observaciones regulares para asegurar consistencia en estándares A&B.",
      bg: "bg-blue-50",
      border: "border-blue-100",
      color: "text-blue-700",
    };
  }

  return {
    label: "Requiere coaching",
    shortLabel: "Coaching",
    helper: "Prioridad alta",
    recommendation:
      "Asignar refuerzos visuales, coaching breve en piso y seguimiento cercano.",
    bg: "bg-red-50",
    border: "border-red-100",
    color: "text-red-700",
  };
}

function HeaderBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold uppercase text-white">
      {children}
    </span>
  );
}

function HeroMetric({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: string;
}) {
  return (
    <div className="rounded-3xl bg-white/10 p-5 backdrop-blur">
      <p className="text-sm font-bold text-white/60">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
      <p className="mt-1 text-xs text-white/50">{status}</p>
    </div>
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
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
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
  icon,
}: {
  title: string;
  value: number;
  suffix?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">
            {value}
            {suffix}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          {icon}
        </div>
      </div>

      {suffix === "%" && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-slate-950"
            style={{ width: `${Math.min(value, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function MiniStatusCard({
  title,
  value,
  helper,
}: {
  title: string;
  value: number;
  helper: string;
}) {
  return (
    <div className="rounded-3xl bg-slate-50 p-4">
      <p className="text-sm font-bold text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function TrainingFollowUpRow({
  training,
}: {
  training: EmployeeAssignedTraining;
}) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-black text-slate-950">
            {training.standard_title || `Estándar #${training.standard}`}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Recurso: {training.resource_title || "Sin recurso"}
          </p>
          {training.reason && (
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {training.reason}
            </p>
          )}
        </div>

        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700">
          {formatStatus(training.status)}
        </span>
      </div>
    </div>
  );
}

function FailedStandardRow({ standard }: { standard: FailedStandard }) {
  return (
    <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-black text-slate-950">{standard.name}</p>
          <p className="mt-1 text-sm text-slate-500">
            {standard.count} respuesta(s) por debajo del estándar
          </p>
        </div>

        <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-black text-red-700">
          {standard.averageScore}%
        </span>
      </div>
    </div>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const icon =
    item.type === "evaluation" ? (
      <ClipboardCheck size={18} />
    ) : item.type === "training" ? (
      <GraduationCap size={18} />
    ) : item.type === "completed" ? (
      <CheckCircle2 size={18} />
    ) : item.type === "reevaluation" ? (
      <RefreshCcw size={18} />
    ) : (
      <BadgeCheck size={18} />
    );

  return (
    <div className="flex gap-4 rounded-3xl bg-slate-50 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
        {icon}
      </div>

      <div>
        <p className="font-black text-slate-950">{item.title}</p>
        <p className="mt-1 text-sm text-slate-500">{formatDate(item.date)}</p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {item.description}
        </p>
      </div>
    </div>
  );
}

function EvaluationCard({ evaluation }: { evaluation: EmployeeEvaluation }) {
  const score = getEvaluationScore(evaluation);

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
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
          <p className="text-xs font-bold text-white/60">Score</p>
          <p className="text-3xl font-black">{score}%</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {evaluation.answers?.map((answer) => (
          <div key={answer.id} className="rounded-2xl bg-white p-4">
            <p className="text-sm font-black text-slate-950">
              {answer.question_text || `Pregunta #${answer.question}`}
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
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-3xl bg-slate-50 p-6 text-center">
      <p className="text-sm font-semibold text-slate-500">{text}</p>
    </div>
  );
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").toUpperCase();
}