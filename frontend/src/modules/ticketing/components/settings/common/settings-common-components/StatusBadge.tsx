type StatusBadgeProps = {
  status: "success" | "warning" | "danger" | "neutral";
  children: string;
};

export default function StatusBadge({ status, children }: StatusBadgeProps) {
  const className =
    status === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "danger"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black",
        className,
      ].join(" ")}
    >
      {children}
    </span>
  );
}
