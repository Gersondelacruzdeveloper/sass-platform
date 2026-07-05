type ToggleCardProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

export default function ToggleCard({
  label,
  description,
  checked,
  onChange,
}: ToggleCardProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:bg-slate-50"
    >
      <div>
        <p className="text-sm font-black text-slate-900">{label}</p>

        {description && (
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {description}
          </p>
        )}
      </div>

      <span
        className={[
          "mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-1 transition",
          checked ? "bg-blue-600" : "bg-slate-300",
        ].join(" ")}
      >
        <span
          className={[
            "h-4 w-4 rounded-full bg-white transition",
            checked ? "translate-x-5" : "translate-x-0",
          ].join(" ")}
        />
      </span>
    </button>
  );
}
