import type { ElementType, ReactNode } from "react";

type SectionCardProps = {
  title: string;
  description?: string;
  icon?: ElementType;
  className?: string;
  children: ReactNode;
};

export default function SectionCard({
  title,
  description,
  icon: Icon,
  className = "",
  children,
}: SectionCardProps) {
  return (
    <section
      className={[
        "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      ].join(" ")}
    >
      <div className="mb-5 flex items-start gap-3">
        {Icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Icon className="h-5 w-5" />
          </div>
        )}

        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>

          {description && (
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}
