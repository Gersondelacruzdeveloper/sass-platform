import type { SellerPermissions } from "../../types/ticketingTypes";
import {
  SELLER_PERMISSION_GROUPS,
  SELLER_PERMISSION_LABELS,
  type PermissionKey,
} from "../../seller-onboarding/sellerOnboardingUi";

type SellerPermissionGridProps = {
  value: Partial<SellerPermissions>;
  onChange: (value: Partial<SellerPermissions>) => void;
  disabled?: boolean;
};

export default function SellerPermissionGrid({
  value,
  onChange,
  disabled = false,
}: SellerPermissionGridProps) {
  function toggle(permission: PermissionKey) {
    if (disabled) return;

    onChange({
      ...value,
      [permission]: !Boolean(value[permission]),
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {SELLER_PERMISSION_GROUPS.map((group) => (
        <section
          key={group.title}
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <h3 className="text-sm font-black text-slate-950">{group.title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {group.description}
          </p>

          <div className="mt-4 space-y-2">
            {group.keys.map((permission) => {
              const checked = Boolean(value[permission]);

              return (
                <label
                  key={permission}
                  className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 transition ${
                    checked
                      ? "border-emerald-200 bg-emerald-50"
                      : "border-slate-200 bg-slate-50"
                  } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
                >
                  <span className="text-sm font-bold text-slate-700">
                    {SELLER_PERMISSION_LABELS[permission]}
                  </span>

                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(permission)}
                    className="h-5 w-5 rounded border-slate-300 text-slate-950 focus:ring-slate-950"
                  />
                </label>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
