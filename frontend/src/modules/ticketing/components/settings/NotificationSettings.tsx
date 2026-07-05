import { Bell } from "lucide-react";
import { SectionCard, ToggleCard } from "./common/settings-common-components";

export type NotificationSettingsModel = {
  send_customer_email: boolean;
  notify_owner_on_booking: boolean;
  notify_seller_on_booking: boolean;
  send_booking_receipt: boolean;
  send_cancellation_email: boolean;
  send_review_request: boolean;
  send_reminder_email: boolean;
};

type Props = {
  settings: NotificationSettingsModel;
  onChange: <K extends keyof NotificationSettingsModel>(
    field: K,
    value: NotificationSettingsModel[K]
  ) => void;
};

export default function NotificationSettings({
  settings,
  onChange,
}: Props) {
  const items: Array<{
    key: keyof NotificationSettingsModel;
    title: string;
    description: string;
  }> = [
    {
      key: "send_customer_email",
      title: "Customer confirmation email",
      description: "Email customers immediately after a successful booking.",
    },
    {
      key: "notify_owner_on_booking",
      title: "Owner booking notification",
      description: "Notify the organisation when a new booking is received.",
    },
    {
      key: "notify_seller_on_booking",
      title: "Seller notification",
      description: "Notify the assigned seller about new bookings.",
    },
    {
      key: "send_booking_receipt",
      title: "Receipt email",
      description: "Attach the booking receipt after payment.",
    },
    {
      key: "send_cancellation_email",
      title: "Cancellation email",
      description: "Automatically email customers when a booking is cancelled.",
    },
    {
      key: "send_review_request",
      title: "Review request",
      description: "Request a review after the tour has finished.",
    },
    {
      key: "send_reminder_email",
      title: "Reminder email",
      description: "Send reminder emails before the pickup time.",
    },
  ];

  return (
    <SectionCard
      title="Notification Settings"
      description="Choose which booking events generate notifications. Email delivery is configured separately in the Communication Center."
      icon={Bell}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <ToggleCard
            key={item.key}
            label={item.title}
            description={item.description}
            checked={settings[item.key]}
            onChange={(value) => onChange(item.key, value)}
          />
        ))}
      </div>
    </SectionCard>
  );
}
