import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Mail,
  Send,
  ShieldCheck,
} from "lucide-react";

export type TicketingEmailSettings = {
  id?: number;
  organisation_name?: string;

  provider:
    | "google_oauth"
    | "microsoft_oauth"
    | "zoho"
    | "amazon_ses"
    | "sendgrid"
    | "mailgun"
    | "custom";

  is_active: boolean;

  smtp_host: string;
  smtp_port: number;
  smtp_encryption: "tls" | "ssl" | "none";

  smtp_username: string;
  smtp_password?: string;

  sender_name: string;
  sender_email: string;
  reply_to_email: string;

  oauth_connected?: boolean;
  oauth_provider_account?: string;
  oauth_token_expiry?: string | null;
  oauth_last_refresh?: string | null;
  oauth_scopes?: string[];

  send_customer_confirmation: boolean;
  send_owner_notification: boolean;
  send_receipt_email: boolean;
  send_cancellation_email: boolean;
  send_review_request_email: boolean;
  send_reminder_email: boolean;

  connection_status: "not_configured" | "untested" | "connected" | "failed";
  configured?: boolean;

  last_test_email?: string;
  last_test_at?: string | null;
  last_error_message?: string;

  created_at?: string;
  updated_at?: string;
};

export const initialEmailSettings: TicketingEmailSettings = {
  provider: "google_oauth",
  is_active: false,

  smtp_host: "",
  smtp_port: 587,
  smtp_encryption: "tls",

  smtp_username: "",
  smtp_password: "",

  sender_name: "",
  sender_email: "",
  reply_to_email: "",

  oauth_connected: false,
  oauth_provider_account: "",
  oauth_token_expiry: null,
  oauth_last_refresh: null,
  oauth_scopes: [],

  send_customer_confirmation: true,
  send_owner_notification: true,
  send_receipt_email: true,
  send_cancellation_email: true,
  send_review_request_email: false,
  send_reminder_email: false,

  connection_status: "not_configured",
  configured: false,

  last_test_email: "",
  last_test_at: null,
  last_error_message: "",
};

type Props = {
  emailSettings: TicketingEmailSettings;
  testRecipient: string;
  testingEmail: boolean;
  connectingGoogle?: boolean;
  disconnectingGoogle?: boolean;
  onConnectGoogle?: () => void;
  onDisconnectGoogle?: () => void;
  onChange: <K extends keyof TicketingEmailSettings>(
    field: K,
    value: TicketingEmailSettings[K],
  ) => void;
  onTestRecipientChange: (value: string) => void;
  onTestEmail: () => void;
};

const smtpProviders = ["zoho", "amazon_ses", "sendgrid", "mailgun", "custom"] as const;

type SmtpProvider = (typeof smtpProviders)[number];

const providerOptions: Array<{
  value: TicketingEmailSettings["provider"];
  label: string;
  helper: string;
}> = [
  {
    value: "google_oauth",
    label: "Google",
    helper: "Recommended for Gmail / Google Workspace",
  },
  {
    value: "microsoft_oauth",
    label: "Microsoft 365",
    helper: "Coming soon",
  },
  {
    value: "zoho",
    label: "Zoho Mail",
    helper: "smtp.zoho.com / 587 / TLS",
  },
  {
    value: "amazon_ses",
    label: "Amazon SES",
    helper: "Amazon SMTP credentials",
  },
  {
    value: "sendgrid",
    label: "SendGrid",
    helper: "smtp.sendgrid.net / 587 / TLS",
  },
  {
    value: "mailgun",
    label: "Mailtrap / Mailgun",
    helper: "SMTP credentials",
  },
  {
    value: "custom",
    label: "Custom SMTP",
    helper: "Enter your own host and port",
  },
];

function isSmtpProvider(
  provider: TicketingEmailSettings["provider"],
): provider is SmtpProvider {
  return smtpProviders.includes(provider as SmtpProvider);
}

function getProviderDefaults(provider: TicketingEmailSettings["provider"]) {
  if (provider === "zoho") {
    return {
      smtp_host: "smtp.zoho.com",
      smtp_port: 587,
      smtp_encryption: "tls" as const,
    };
  }

  if (provider === "amazon_ses") {
    return {
      smtp_host: "email-smtp.us-east-1.amazonaws.com",
      smtp_port: 587,
      smtp_encryption: "tls" as const,
    };
  }

  if (provider === "sendgrid") {
    return {
      smtp_host: "smtp.sendgrid.net",
      smtp_port: 587,
      smtp_encryption: "tls" as const,
    };
  }

  if (provider === "mailgun") {
    return {
      smtp_host: "smtp.mailgun.org",
      smtp_port: 587,
      smtp_encryption: "tls" as const,
    };
  }

  return null;
}

function getStatusCopy(status: TicketingEmailSettings["connection_status"]) {
  if (status === "connected") return "Connected";
  if (status === "failed") return "Failed";
  if (status === "untested") return "Untested";
  return "Not configured";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Never tested";

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function TicketingEmailSettingsPanel({
  emailSettings,
  testRecipient,
  testingEmail,
  connectingGoogle = false,
  disconnectingGoogle = false,
  onConnectGoogle,
  onDisconnectGoogle,
  onChange,
  onTestRecipientChange,
  onTestEmail,
}: Props) {
  const connected =
    emailSettings.connection_status === "connected" ||
    Boolean(emailSettings.oauth_connected);
  const failed = emailSettings.connection_status === "failed";
  const showGoogleOAuth = emailSettings.provider === "google_oauth";
  const showMicrosoftOAuth = emailSettings.provider === "microsoft_oauth";
  const showSmtpFields = isSmtpProvider(emailSettings.provider);
  const googleConnected = Boolean(emailSettings.oauth_connected);

  function handleProviderChange(provider: TicketingEmailSettings["provider"]) {
    onChange("provider", provider);

    const defaults = getProviderDefaults(provider);

    if (defaults) {
      onChange("smtp_host", defaults.smtp_host);
      onChange("smtp_port", defaults.smtp_port);
      onChange("smtp_encryption", defaults.smtp_encryption);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
            <Mail className="h-6 w-6" />
          </div>

          <div>
            <p className="text-sm font-black uppercase tracking-wide text-blue-600">
              Communication Center
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              Email Notification Center
            </h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Let this organisation send booking confirmations and owner alerts
              from its own email account. Google is connected securely with
              OAuth, without asking customers for SMTP passwords.
            </p>
          </div>
        </div>

        <div
          className={[
            "rounded-2xl border px-4 py-3 text-sm font-black",
            connected
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : failed
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-slate-200 bg-slate-50 text-slate-600",
          ].join(" ")}
        >
          {connected ? "🟢" : failed ? "🔴" : "⚪"} {" "}
          {getStatusCopy(emailSettings.connection_status)}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-black text-slate-950">Email provider</h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            Google is the easiest professional option. SMTP is available only
            for advanced providers.
          </p>

          <div className="mt-4 grid gap-2">
            {providerOptions.map((provider) => (
              <button
                key={provider.value}
                type="button"
                onClick={() => handleProviderChange(provider.value)}
                className={[
                  "rounded-2xl border px-4 py-3 text-left transition",
                  emailSettings.provider === provider.value
                    ? "border-blue-300 bg-blue-50 text-blue-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <span className="flex items-center justify-between gap-3 text-sm font-black">
                  {provider.label}
                  {emailSettings.provider === provider.value && (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  )}
                </span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">
                  {provider.helper}
                </span>
              </button>
            ))}
          </div>
        </div>

        {showGoogleOAuth && (
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
              <div>
                <h3 className="text-sm font-black text-blue-950">
                  Connect Google securely
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-blue-800">
                  Customers sign in with Gmail or Google Workspace and approve
                  permission. Booking emails then send from their own account.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/80 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                Google account
              </p>
              <p className="mt-1 text-sm font-black text-slate-950">
                {googleConnected
                  ? emailSettings.oauth_provider_account ||
                    emailSettings.sender_email ||
                    "Connected Google account"
                  : "Not connected yet"}
              </p>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                Last refresh: {formatDateTime(emailSettings.oauth_last_refresh)}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onConnectGoogle}
                disabled={connectingGoogle || !onConnectGoogle}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {connectingGoogle ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4" />
                )}
                {googleConnected ? "Reconnect Google" : "Connect Google"}
              </button>

              {googleConnected && (
                <button
                  type="button"
                  onClick={onDisconnectGoogle}
                  disabled={disconnectingGoogle || !onDisconnectGoogle}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {disconnectingGoogle ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Disconnect Google
                </button>
              )}
            </div>

            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">
              Recommended: no SMTP host, port, app password or Gmail password is
              needed for Google OAuth.
            </div>
          </div>
        )}

        {showMicrosoftOAuth && (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
              <div>
                <h3 className="text-sm font-black text-slate-950">
                  Microsoft 365 coming soon
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
                  Microsoft OAuth will be added later for Outlook and Microsoft
                  365 accounts. Use Google now, or Custom SMTP as an advanced
                  fallback.
                </p>
              </div>
            </div>
          </div>
        )}

        {showSmtpFields && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <h3 className="text-sm font-black text-amber-950">
                  Advanced SMTP fallback
                </h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">
                  Use this only for providers that give SMTP credentials.
                  DigitalOcean may block or time out outbound SMTP depending on
                  the provider and port.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <ToggleCard
          label="Enable email sending"
          description="Allow this organisation to send email notifications using this email provider."
          checked={emailSettings.is_active}
          onChange={(value) => onChange("is_active", value)}
        />

        <Input
          label="Sender name"
          value={emailSettings.sender_name}
          onChange={(value) => onChange("sender_name", value)}
          placeholder="Punta Cana Discovery"
        />

        {showSmtpFields && (
          <>
            <Input
              label="Email address / SMTP username"
              value={emailSettings.smtp_username}
              onChange={(value) => {
                onChange("smtp_username", value);

                if (!emailSettings.sender_email) {
                  onChange("sender_email", value);
                }

                if (!testRecipient) {
                  onTestRecipientChange(value);
                }
              }}
              placeholder="bookings@example.com"
            />

            <Input
              label="Sender email"
              value={emailSettings.sender_email}
              onChange={(value) => onChange("sender_email", value)}
              placeholder="bookings@example.com"
            />

            <Input
              label="SMTP password"
              value={emailSettings.smtp_password || ""}
              type="password"
              onChange={(value) => onChange("smtp_password", value)}
              placeholder={
                emailSettings.configured
                  ? "Saved — leave blank to keep current password"
                  : "SMTP password"
              }
            />

            <Input
              label="Reply-to email"
              value={emailSettings.reply_to_email}
              onChange={(value) => onChange("reply_to_email", value)}
              placeholder="sales@example.com"
            />

            <Input
              label="SMTP host"
              value={emailSettings.smtp_host}
              onChange={(value) => onChange("smtp_host", value)}
              placeholder="smtp.example.com"
            />

            <Input
              label="SMTP port"
              value={String(emailSettings.smtp_port || 587)}
              type="number"
              onChange={(value) => onChange("smtp_port", Number(value || 587))}
              placeholder="587"
            />

            <Select
              label="Encryption"
              value={emailSettings.smtp_encryption}
              onChange={(value) =>
                onChange(
                  "smtp_encryption",
                  value as TicketingEmailSettings["smtp_encryption"],
                )
              }
              options={[
                { value: "tls", label: "TLS" },
                { value: "ssl", label: "SSL" },
                { value: "none", label: "None" },
              ]}
            />
          </>
        )}

        {!showSmtpFields && (
          <>
            <Input
              label="Sender email"
              value={emailSettings.sender_email}
              onChange={(value) => onChange("sender_email", value)}
              placeholder="Connected Google account email"
            />

            <Input
              label="Reply-to email"
              value={emailSettings.reply_to_email}
              onChange={(value) => onChange("reply_to_email", value)}
              placeholder="Optional reply-to email"
            />
          </>
        )}
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-sm font-black text-slate-950">Booking email rules</h3>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          These work together with the general notification toggles above.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ToggleCard
            label="Customer confirmation"
            checked={emailSettings.send_customer_confirmation}
            onChange={(value) => onChange("send_customer_confirmation", value)}
          />

          <ToggleCard
            label="Owner notification"
            checked={emailSettings.send_owner_notification}
            onChange={(value) => onChange("send_owner_notification", value)}
          />

          <ToggleCard
            label="Receipt email"
            checked={emailSettings.send_receipt_email}
            onChange={(value) => onChange("send_receipt_email", value)}
          />

          <ToggleCard
            label="Cancellation email"
            checked={emailSettings.send_cancellation_email}
            onChange={(value) => onChange("send_cancellation_email", value)}
          />

          <ToggleCard
            label="Reminder email"
            checked={emailSettings.send_reminder_email}
            onChange={(value) => onChange("send_reminder_email", value)}
          />

          <ToggleCard
            label="Review request"
            checked={emailSettings.send_review_request_email}
            onChange={(value) => onChange("send_review_request_email", value)}
          />
        </div>
      </div>

      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div>
            <h3 className="text-sm font-black text-slate-950">Test connection</h3>
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              Last tested: {formatDateTime(emailSettings.last_test_at)}
            </p>
          </div>

          {emailSettings.last_test_email && (
            <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
              Last email: {emailSettings.last_test_email}
            </p>
          )}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
          <Input
            label="Send test email to"
            value={testRecipient}
            onChange={onTestRecipientChange}
            placeholder="bookings@gmail.com"
          />

          <button
            type="button"
            onClick={onTestEmail}
            disabled={testingEmail || (showGoogleOAuth && !googleConnected)}
            className="inline-flex h-12 items-center justify-center gap-2 self-end rounded-2xl bg-blue-700 px-5 text-sm font-black text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {testingEmail ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {testingEmail ? "Testing..." : "Send Test Email"}
          </button>
        </div>

        {showGoogleOAuth && !googleConnected && (
          <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm font-bold text-blue-800">
            Connect Google before sending a test email.
          </div>
        )}

        {emailSettings.last_error_message && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{emailSettings.last_error_message}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>

      <input
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleCard({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
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
