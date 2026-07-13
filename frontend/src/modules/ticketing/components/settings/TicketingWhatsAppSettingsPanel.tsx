// src/modules/ticketing/components/settings/TicketingWhatsAppSettingsPanel.tsx

import type { ElementType } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
  MessageCircle,
  Phone,
  PlugZap,
  Send,
  ShieldCheck,
  Unplug,
} from "lucide-react";

export type TicketingWhatsAppSettings = {
  id?: number;
  organisation_name?: string;

  provider: "meta_cloud_api";
  is_active: boolean;

  meta_app_id: string;
  meta_app_secret?: string;
  business_account_id: string;
  phone_number_id: string;
  access_token?: string;
  token_expires_at?: string | null;

  display_phone_number: string;
  verified_business_name: string;

  webhook_verify_token?: string;
  webhook_subscribed: boolean;
  webhook_subscribed_at?: string | null;

  customer_confirmation_template: string;
  customer_confirmation_language: string;

  supplier_booking_template: string;
  supplier_booking_language: string;

  customer_reminder_template: string;
  customer_reminder_language: string;

  send_customer_confirmation: boolean;
  send_supplier_booking_notification: boolean;
  send_customer_reminder: boolean;
  attach_customer_ticket: boolean;
  attach_supplier_voucher: boolean;

  connection_status:
    | "not_configured"
    | "pending"
    | "connected"
    | "failed"
    | "disconnected";

  connected_at?: string | null;
  last_test_recipient: string;
  last_test_at?: string | null;
  last_error_message: string;

  configured?: boolean;
  connected?: boolean;
  masked_phone_number_id?: string;
};

export const initialWhatsAppSettings: TicketingWhatsAppSettings = {
  provider: "meta_cloud_api",
  is_active: false,

  meta_app_id: "",
  meta_app_secret: "",
  business_account_id: "",
  phone_number_id: "",
  access_token: "",
  token_expires_at: null,

  display_phone_number: "",
  verified_business_name: "",

  webhook_verify_token: "",
  webhook_subscribed: false,
  webhook_subscribed_at: null,

  customer_confirmation_template: "",
  customer_confirmation_language: "en_US",

  supplier_booking_template: "",
  supplier_booking_language: "en_US",

  customer_reminder_template: "",
  customer_reminder_language: "en_US",

  send_customer_confirmation: true,
  send_supplier_booking_notification: true,
  send_customer_reminder: false,
  attach_customer_ticket: true,
  attach_supplier_voucher: true,

  connection_status: "not_configured",
  connected_at: null,
  last_test_recipient: "",
  last_test_at: null,
  last_error_message: "",

  configured: false,
  connected: false,
  masked_phone_number_id: "",
};

type Props = {
  whatsappSettings: TicketingWhatsAppSettings;
  testRecipient: string;

  testingConnection: boolean;
  sendingTest: boolean;
  disconnecting: boolean;

  onChange: <K extends keyof TicketingWhatsAppSettings>(
    field: K,
    value: TicketingWhatsAppSettings[K],
  ) => void;

  onTestRecipientChange: (value: string) => void;
  onTestConnection: () => void;
  onSendTest: () => void;
  onDisconnect: () => void;
};

export default function TicketingWhatsAppSettingsPanel({
  whatsappSettings,
  testRecipient,
  testingConnection,
  sendingTest,
  disconnecting,
  onChange,
  onTestRecipientChange,
  onTestConnection,
  onSendTest,
  onDisconnect,
}: Props) {
  const connected =
    whatsappSettings.connection_status === "connected" ||
    whatsappSettings.connected === true;

  const configured =
    whatsappSettings.configured ??
    Boolean(
      whatsappSettings.phone_number_id &&
        whatsappSettings.business_account_id,
    );

  const statusLabel = getConnectionStatusLabel(
    whatsappSettings.connection_status,
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <MessageCircle className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-lg font-black text-slate-950">
              WhatsApp Business
            </h2>

            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Connect this organisation&apos;s Meta WhatsApp Cloud API sender.
              Customer and supplier phone numbers are stored separately on
              bookings and business entities.
            </p>
          </div>
        </div>

        <StatusBadge
          connected={connected}
          label={statusLabel}
        />
      </div>

      {whatsappSettings.last_error_message && (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{whatsappSettings.last_error_message}</span>
        </div>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5">
          <Card
            title="Meta connection"
            description="Use the credentials from the organisation's Meta developer application and WhatsApp Business account."
            icon={Link2}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Meta App ID"
                value={whatsappSettings.meta_app_id}
                onChange={(value) => onChange("meta_app_id", value)}
                placeholder="123456789012345"
              />

              <Input
                label="WhatsApp Business Account ID"
                value={whatsappSettings.business_account_id}
                onChange={(value) =>
                  onChange("business_account_id", value)
                }
                placeholder="WABA ID"
              />

              <Input
                label="Phone Number ID"
                value={whatsappSettings.phone_number_id}
                onChange={(value) => onChange("phone_number_id", value)}
                placeholder="Meta phone number ID"
              />

              <Input
                label="Meta App Secret"
                type="password"
                value={whatsappSettings.meta_app_secret || ""}
                onChange={(value) => onChange("meta_app_secret", value)}
                placeholder={
                  configured
                    ? "Leave blank to keep current secret"
                    : "Paste app secret"
                }
              />

              <Input
                label="Permanent/System User Access Token"
                type="password"
                value={whatsappSettings.access_token || ""}
                onChange={(value) => onChange("access_token", value)}
                placeholder={
                  configured
                    ? "Leave blank to keep current token"
                    : "Paste access token"
                }
                className="sm:col-span-2"
              />

              <Input
                label="Webhook Verify Token"
                type="password"
                value={whatsappSettings.webhook_verify_token || ""}
                onChange={(value) =>
                  onChange("webhook_verify_token", value)
                }
                placeholder="Create a private verification token"
                className="sm:col-span-2"
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <InfoValue
                label="Business name"
                value={whatsappSettings.verified_business_name || "Not loaded"}
              />

              <InfoValue
                label="Sender number"
                value={whatsappSettings.display_phone_number || "Not loaded"}
              />

              <InfoValue
                label="Webhook"
                value={
                  whatsappSettings.webhook_subscribed
                    ? "Subscribed"
                    : "Not subscribed"
                }
              />
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onTestConnection}
                disabled={testingConnection}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testingConnection ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlugZap className="h-4 w-4" />
                )}
                {testingConnection ? "Testing..." : "Test Connection"}
              </button>

              <button
                type="button"
                onClick={onDisconnect}
                disabled={disconnecting || !connected}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disconnecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unplug className="h-4 w-4" />
                )}
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </Card>

          <Card
            title="Approved Meta templates"
            description="These names must exactly match approved utility templates in WhatsApp Manager."
            icon={ShieldCheck}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <Input
                label="Customer confirmation template"
                value={whatsappSettings.customer_confirmation_template}
                onChange={(value) =>
                  onChange("customer_confirmation_template", value)
                }
                placeholder="booking_confirmation"
              />

              <Input
                label="Customer template language"
                value={whatsappSettings.customer_confirmation_language}
                onChange={(value) =>
                  onChange("customer_confirmation_language", value)
                }
                placeholder="en_US"
              />

              <Input
                label="Supplier booking template"
                value={whatsappSettings.supplier_booking_template}
                onChange={(value) =>
                  onChange("supplier_booking_template", value)
                }
                placeholder="supplier_new_booking"
              />

              <Input
                label="Supplier template language"
                value={whatsappSettings.supplier_booking_language}
                onChange={(value) =>
                  onChange("supplier_booking_language", value)
                }
                placeholder="en_US"
              />

              <Input
                label="Customer reminder template"
                value={whatsappSettings.customer_reminder_template}
                onChange={(value) =>
                  onChange("customer_reminder_template", value)
                }
                placeholder="booking_reminder"
              />

              <Input
                label="Reminder template language"
                value={whatsappSettings.customer_reminder_language}
                onChange={(value) =>
                  onChange("customer_reminder_language", value)
                }
                placeholder="en_US"
              />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card
            title="Delivery rules"
            description="Control which automated WhatsApp messages this organisation may send."
            icon={MessageCircle}
          >
            <div className="grid gap-3">
              <Toggle
                label="WhatsApp integration active"
                description="Allow this organisation to send through the connected Meta account."
                checked={whatsappSettings.is_active}
                onChange={(value) => onChange("is_active", value)}
              />

              <Toggle
                label="Customer confirmations"
                description="Send a confirmation after a payment or deposit is confirmed."
                checked={whatsappSettings.send_customer_confirmation}
                onChange={(value) =>
                  onChange("send_customer_confirmation", value)
                }
              />

              <Toggle
                label="Supplier booking notifications"
                description="Allow supplier WhatsApp notifications when supplier contacts are configured."
                checked={
                  whatsappSettings.send_supplier_booking_notification
                }
                onChange={(value) =>
                  onChange(
                    "send_supplier_booking_notification",
                    value,
                  )
                }
              />

              <Toggle
                label="Customer reminders"
                description="Enable future scheduled excursion and pickup reminders."
                checked={whatsappSettings.send_customer_reminder}
                onChange={(value) =>
                  onChange("send_customer_reminder", value)
                }
              />

              <Toggle
                label="Attach customer ticket"
                description="Include the existing booking ticket PDF when supported by the template flow."
                checked={whatsappSettings.attach_customer_ticket}
                onChange={(value) =>
                  onChange("attach_customer_ticket", value)
                }
              />

              <Toggle
                label="Attach ticket to supplier"
                description="Send the same existing booking ticket to the supplier for now."
                checked={whatsappSettings.attach_supplier_voucher}
                onChange={(value) =>
                  onChange("attach_supplier_voucher", value)
                }
              />
            </div>
          </Card>

          <Card
            title="Send a test message"
            description="Use a phone number with the full international country code."
            icon={Send}
          >
            <Input
              label="Test WhatsApp number"
              value={testRecipient}
              onChange={onTestRecipientChange}
              placeholder="+1 809 555 0000"
            />

            <button
              type="button"
              onClick={onSendTest}
              disabled={sendingTest || !testRecipient.trim()}
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sendingTest ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sendingTest ? "Sending..." : "Send Test Message"}
            </button>

            <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
              Business-initiated tests normally require an approved Meta
              template. The backend should use the configured customer
              confirmation template or a dedicated test template.
            </p>
          </Card>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <Phone className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />

              <div>
                <p className="text-sm font-black text-blue-950">
                  Sender versus recipient
                </p>

                <p className="mt-1 text-sm font-semibold leading-6 text-blue-800">
                  This connected number is the sender. The customer&apos;s
                  booking phone and each supplier&apos;s business-entity phone
                  determine who receives each message.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Card({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm">
          <Icon className="h-4 w-4" />
        </div>

        <div>
          <h3 className="text-sm font-black text-slate-950">{title}</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-4">{children}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder = "",
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-sm font-black text-slate-700">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "new-password" : "off"}
        className="h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
      />
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-slate-300"
    >
      <span>
        <span className="block text-sm font-black text-slate-900">
          {label}
        </span>

        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
          {description}
        </span>
      </span>

      <span
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 rounded-full transition ${
          checked ? "bg-emerald-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </span>
    </button>
  );
}

function InfoValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 break-all text-sm font-black text-slate-900">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  connected,
  label,
}: {
  connected: boolean;
  label: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${
        connected
          ? "bg-emerald-100 text-emerald-700"
          : "bg-slate-100 text-slate-600"
      }`}
    >
      {connected ? (
        <CheckCircle2 className="h-4 w-4" />
      ) : (
        <AlertCircle className="h-4 w-4" />
      )}
      {label}
    </div>
  );
}

function getConnectionStatusLabel(
  status: TicketingWhatsAppSettings["connection_status"],
) {
  switch (status) {
    case "connected":
      return "Connected";
    case "pending":
      return "Pending";
    case "failed":
      return "Connection failed";
    case "disconnected":
      return "Disconnected";
    default:
      return "Not configured";
  }
}
