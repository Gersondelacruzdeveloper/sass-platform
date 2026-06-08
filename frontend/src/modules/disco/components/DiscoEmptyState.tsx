// src/modules/disco/components/DiscoEmptyState.tsx

import type { ComponentType, ReactNode } from "react";
import { Inbox } from "lucide-react";

type IconComponent = ComponentType<{
  className?: string;
}>;

type DiscoEmptyStateProps = {
  title: string;
  description?: string;
  icon?: IconComponent;
  action?: ReactNode;
};

export default function DiscoEmptyState({
  title,
  description,
  icon: Icon,
  action,
}: DiscoEmptyStateProps) {
  const EmptyIcon = Icon || Inbox;

  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-100 text-slate-400">
        <EmptyIcon className="h-10 w-10" />
      </div>

      <h2 className="text-xl font-black text-slate-900 sm:text-2xl">
        {title}
      </h2>

      {description && (
        <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-500 sm:text-base">
          {description}
        </p>
      )}

      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}