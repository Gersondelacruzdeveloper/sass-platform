import type { ReactNode } from "react";

type TicketingPageShellProps = {
  title: string;
  subtitle?: string;
  children?: ReactNode;
};

export default function TicketingPageShell({
  title,
  subtitle,
  children,
}: TicketingPageShellProps) {
  return (
    <section className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-black uppercase tracking-wide text-amber-600">
          PCD Experiences
        </p>

        <h1 className="mt-2 text-2xl font-black text-slate-950">
          {title}
        </h1>

        {subtitle && (
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
            {subtitle}
          </p>
        )}
      </div>

      {children || (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-bold text-slate-500">
            This page is ready. We will connect the real data and UI next.
          </p>
        </div>
      )}
    </section>
  );
}