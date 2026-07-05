import { ClipboardCheck } from "lucide-react";
import { SectionCard, ToggleCard, FormInput } from "./common/settings-common-components";

export type BookingRules = {
  require_pickup: boolean;
  allow_partial_payment: boolean;
  auto_confirm_booking: boolean;
  require_customer_phone: boolean;
  require_customer_passport: boolean;
  minimum_notice_hours: string;
  cancellation_hours: string;
};

type Props = {
  rules: BookingRules;
  onChange: <K extends keyof BookingRules>(field: K, value: BookingRules[K]) => void;
};

export default function BookingRulesSettings({ rules, onChange }: Props) {
  return (
    <SectionCard
      title="Booking Rules"
      description="Configure the default behaviour for new bookings."
      icon={ClipboardCheck}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <ToggleCard
          label="Require pickup information"
          checked={rules.require_pickup}
          onChange={(v)=>onChange("require_pickup",v)}
        />
        <ToggleCard
          label="Allow partial payments"
          checked={rules.allow_partial_payment}
          onChange={(v)=>onChange("allow_partial_payment",v)}
        />
        <ToggleCard
          label="Auto confirm bookings"
          checked={rules.auto_confirm_booking}
          onChange={(v)=>onChange("auto_confirm_booking",v)}
        />
        <ToggleCard
          label="Require customer phone"
          checked={rules.require_customer_phone}
          onChange={(v)=>onChange("require_customer_phone",v)}
        />
        <ToggleCard
          label="Require passport"
          checked={rules.require_customer_passport}
          onChange={(v)=>onChange("require_customer_passport",v)}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <FormInput
          label="Minimum booking notice (hours)"
          type="number"
          value={rules.minimum_notice_hours}
          onChange={(v)=>onChange("minimum_notice_hours",v)}
          placeholder="2"
        />
        <FormInput
          label="Cancellation window (hours)"
          type="number"
          value={rules.cancellation_hours}
          onChange={(v)=>onChange("cancellation_hours",v)}
          placeholder="24"
        />
      </div>
    </SectionCard>
  );
}
