import { Link, useParams } from "react-router-dom";
import { ClipboardCheck, GraduationCap, Users } from "lucide-react";

export default function FacilitatorDashboardPage() {
  const { organisationSlug } = useParams();
  const basePath = `/training/${organisationSlug}/facilitator`;

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl">
        <p className="text-sm font-bold text-white/60">
          Facilitator Workspace
        </p>

        <h1 className="mt-2 text-3xl font-black">
          My Training Dashboard
        </h1>

        <p className="mt-3 max-w-2xl text-sm text-white/65">
          Manage your assigned employees, complete evaluations, create training
          sessions, and report opportunities found during service.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ActionCard
          title="My Employees"
          description="View the employees assigned to you."
          icon={<Users />}
          to={`${basePath}/employees`}
        />

        <ActionCard
          title="Create Evaluations"
          description="Evaluate service, standards, attitude, and performance."
          icon={<ClipboardCheck />}
          to={`${basePath}/evaluations`}
        />

        <ActionCard
          title="My Trainings"
          description="Create and follow up training sessions."
          icon={<GraduationCap />}
          to={`${basePath}/trainings`}
        />
      </section>
    </div>
  );
}

function ActionCard({
  title,
  description,
  icon,
  to,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
        {icon}
      </div>

      <h2 className="text-xl font-black text-slate-950">
        {title}
      </h2>

      <p className="mt-2 text-sm text-slate-500">
        {description}
      </p>
    </Link>
  );
}