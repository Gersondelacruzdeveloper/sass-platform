type ColorInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export default function ColorInput({ label, value, onChange }: ColorInputProps) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>

      <div className="mt-2 flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer rounded-lg border border-slate-200 bg-white"
        />

        <input
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-900 outline-none"
        />
      </div>
    </label>
  );
}
