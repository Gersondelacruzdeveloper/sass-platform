// src/modules/disco/components/DiscoPageHeader.tsx

import type { ComponentType, ReactNode } from "react";

type IconComponent = ComponentType<{ className?: string }>;

type DiscoPageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: IconComponent;
  actions?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
};

export default function DiscoPageHeader({
  title,
  subtitle,
  icon: Icon,
  actions,
  actionLabel,
  onAction,
}: DiscoPageHeaderProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
              <Icon className="h-7 w-7" />
            </div>
          )}

          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black text-slate-900 sm:text-3xl">
              {title}
            </h1>

            {subtitle && (
              <p className="mt-1 text-sm font-medium text-slate-500 sm:text-base">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {(actions || actionLabel) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
            {actions}

            {actionLabel && onAction && (
              <button
                type="button"
                onClick={onAction}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
              >
                {actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}