import TicketingPageShell from "../components/TicketingPageShell";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";

export default function TicketingSubscriptionCancelPage() {
  const { t } = useTicketingAdminTranslation();

  return (
    <TicketingPageShell
      title={t("subscriptionCancel.title")}
      subtitle={t("subscriptionCancel.subtitle")}
    />
  );
}