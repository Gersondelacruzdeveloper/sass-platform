import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  ClipboardCheck,
  GraduationCap,
  Sparkles,
  Users,
} from "lucide-react";

export default function FacilitatorDashboardPage() {
  const { organisationSlug } = useParams();
  const basePath = `/training/${organisationSlug}/facilitator`;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                <Sparkles size={16} />
                Facilitator Workspace
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                My Training Dashboard
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Manage assigned employees, complete evaluations, follow up
                training sessions, and report opportunities found during
                service.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5 lg:min-w-72">
              <p className="text-sm font-semibold text-white/60">
                Today&apos;s Focus
              </p>

              <p className="mt-2 text-2xl font-black">
                Coach · Evaluate · Follow up
              </p>

              <p className="mt-1 text-sm text-white/60">
                Keep your assigned team aligned with A&B standards.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <ActionCard
            title="My Employees"
            description="View employees assigned to you and open their profiles."
            icon={<Users />}
            to={`${basePath}/employees`}
            tag="Team follow-up"
          />

          <ActionCard
            title="Create Evaluations"
            description="Evaluate service, standards, attitude, and performance."
            icon={<ClipboardCheck />}
            to={`${basePath}/evaluations`}
            tag="Service quality"
          />

          <ActionCard
            title="My Trainings"
            description="Create and follow up training sessions for your team."
            icon={<GraduationCap />}
            to={`${basePath}/trainings`}
            tag="Training action"
          />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <InfoPanel
            title="What to do today"
            items={[
              "Review your assigned employees.",
              "Complete at least one service evaluation.",
              "Add coaching notes after observing service.",
            ]}
          />

          <InfoPanel
            title="Evaluation reminder"
            items={[
              "Score based on real service behavior.",
              "Use notes for clear coaching feedback.",
              "Focus on standards, not personal opinion.",
            ]}
          />

          <InfoPanel
            title="Manager expectation"
            items={[
              "Keep employee profiles updated.",
              "Report repeated service gaps.",
              "Follow up after every training session.",
            ]}
          />
        </section>
      </div>
    </div>
  );
}

function ActionCard({
  title,
  description,
  icon,
  to,
  tag,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
  tag: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
          {icon}
        </div>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
          {tag}
        </span>
      </div>

      <h2 className="text-xl font-black text-slate-950">{title}</h2>

      <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
        {description}
      </p>

      <div className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-950">
        Open
        <ArrowRight
          size={16}
          className="transition group-hover:translate-x-1"
        />
      </div>
    </Link>
  );
}

function InfoPanel({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-black text-slate-950">{title}</h3>

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div
            key={item}
            className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600"
          >
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}