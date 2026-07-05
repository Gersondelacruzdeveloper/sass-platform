import type { ComponentType, ElementType, ReactNode } from "react";
import { CreditCard } from "lucide-react";

type TicketingPaymentProviderSettings = {
  id?: number;
  organisation_name?: string;
  default_provider: "stripe" | "paypal" | "none";
  stripe_enabled: boolean;
  stripe_publishable_key: string;
  stripe_secret_key?: string;
  stripe_webhook_secret?: string;
  stripe_connect_account_id: string;
  stripe_connect_status:
    | "not_connected"
    | "pending"
    | "connected"
    | "restricted";
  stripe_configured?: boolean;
  paypal_enabled: boolean;
  paypal_mode: "sandbox" | "live";
  paypal_client_id: string;
  paypal_client_secret?: string;
  paypal_merchant_id: string;
  paypal_webhook_id?: string;
  paypal_configured?: boolean;
  payment_success_message: string;
  payment_pending_message: string;
  is_active: boolean;
};

type TicketingPublicSiteSettings = {
  custom_domain: string;
  subdomain: string;
};

type PanelProps = {
  title: string;
  description: string;
  icon: ElementType;
  className?: string;
  children: ReactNode;
};

type InputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
  help?: ReactNode;
};

type TextareaProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

type SelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  help?: ReactNode;
};

type ToggleProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

type PaymentHelpCardProps = {
  title: string;
  steps: string[];
  links?: { label: string; href: string }[];
  tone?: "blue" | "amber";
  children?: ReactNode;
};

type CopyValueProps = {
  label: string;
  value: string;
};

type Props = {
  paymentProviders: TicketingPaymentProviderSettings;
  publicSite: TicketingPublicSiteSettings;
  organisationSlug?: string;
  onChange: <K extends keyof TicketingPaymentProviderSettings>(
    field: K,
    value: TicketingPaymentProviderSettings[K],
  ) => void;
  Panel: ComponentType<PanelProps>;
  Input: ComponentType<InputProps>;
  Textarea: ComponentType<TextareaProps>;
  Select: ComponentType<SelectProps>;
  Toggle: ComponentType<ToggleProps>;
  PaymentHelpCard: ComponentType<PaymentHelpCardProps>;
  CopyValue: ComponentType<CopyValueProps>;
  getDetectedPublicDomain: (
    publicSite: TicketingPublicSiteSettings,
    organisationSlug?: string,
  ) => string;
  getStripeWebhookEndpoint: () => string;
  getStripeKeyModeLabel: (value: string) => string;
};

export default function PaymentProvidersSettings({
  paymentProviders,
  publicSite,
  organisationSlug,
  onChange,
  Panel,
  Input,
  Textarea,
  Select,
  Toggle,
  PaymentHelpCard,
  CopyValue,
  getDetectedPublicDomain,
  getStripeWebhookEndpoint,
  getStripeKeyModeLabel,
}: Props) {
  return (
    <Panel
      title="Online payment gateways"
      description="Allow each organisation to receive online customer payments through its own Stripe or PayPal credentials. Secret keys are write-only and will not be shown again after saving."
      icon={CreditCard}
      className="xl:col-span-2"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Select
          label="Default online gateway"
          value={paymentProviders.default_provider}
          onChange={(value) =>
            onChange(
              "default_provider",
              value as TicketingPaymentProviderSettings["default_provider"],
            )
          }
          options={[
            { value: "none", label: "None" },
            { value: "stripe", label: "Stripe" },
            { value: "paypal", label: "PayPal" },
          ]}
        />

        <Toggle
          label="Payment settings active"
          description="Allow online payment gateways for this organisation."
          checked={paymentProviders.is_active}
          onChange={(value) => onChange("is_active", value)}
        />

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <span>Stripe</span>
            <strong
              className={
                paymentProviders.stripe_configured
                  ? "text-emerald-700"
                  : "text-slate-700"
              }
            >
              {paymentProviders.stripe_configured ? "Ready" : "Not configured"}
            </strong>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>PayPal</span>
            <strong
              className={
                paymentProviders.paypal_configured
                  ? "text-emerald-700"
                  : "text-slate-700"
              }
            >
              {paymentProviders.paypal_configured ? "Ready" : "Not configured"}
            </strong>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Detected public site: {" "}
            <strong>
              {getDetectedPublicDomain(publicSite, organisationSlug)}
            </strong>
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-950">
                Stripe Checkout
              </h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Paste the organisation Stripe API keys. The webhook endpoint
                below is detected automatically from this SaaS API URL.
              </p>
            </div>

            <Toggle
              label="Enable Stripe"
              checked={paymentProviders.stripe_enabled}
              onChange={(value) => onChange("stripe_enabled", value)}
            />
          </div>

          <PaymentHelpCard
            title="Stripe setup guide"
            tone="blue"
            steps={[
              "Open Stripe Dashboard and switch Test mode on while testing.",
              "Go to Developers → API keys and copy the Publishable key and Secret key.",
              "Go to Developers → Webhooks and create an endpoint using the URL shown below.",
              "Select checkout.session.completed as the event to send.",
              "Copy the webhook Signing secret and paste it in Stripe webhook secret.",
            ]}
            links={[
              {
                label: "Open Stripe API keys",
                href: "https://dashboard.stripe.com/apikeys",
              },
              {
                label: "Open Stripe webhooks",
                href: "https://dashboard.stripe.com/webhooks",
              },
            ]}
          >
            <CopyValue
              label="Webhook endpoint to paste in Stripe"
              value={getStripeWebhookEndpoint()}
            />
          </PaymentHelpCard>

          <div className="mt-4 grid gap-4">
            <Input
              label="Stripe publishable key"
              help="Found in Stripe Dashboard → Developers → API keys. Starts with pk_test_ or pk_live_."
              value={paymentProviders.stripe_publishable_key}
              onChange={(value) => onChange("stripe_publishable_key", value)}
              placeholder="pk_test_..."
            />

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600">
              Key mode: {" "}
              <span className="text-slate-950">
                {getStripeKeyModeLabel(paymentProviders.stripe_publishable_key)}
              </span>
            </div>

            <Input
              label="Stripe secret key"
              help="Found in Stripe Dashboard → Developers → API keys. Starts with sk_test_ or sk_live_. Leave blank after saving to keep the saved key."
              value={paymentProviders.stripe_secret_key || ""}
              onChange={(value) => onChange("stripe_secret_key", value)}
              placeholder={
                paymentProviders.stripe_configured
                  ? "Saved — leave blank to keep current key"
                  : "sk_test_..."
              }
            />

            <Input
              label="Stripe webhook secret"
              help="After creating the webhook endpoint, click Reveal signing secret in Stripe. It starts with whsec_."
              value={paymentProviders.stripe_webhook_secret || ""}
              onChange={(value) => onChange("stripe_webhook_secret", value)}
              placeholder={
                paymentProviders.stripe_configured
                  ? "Saved — leave blank to keep current webhook secret"
                  : "whsec_..."
              }
            />

            <Input
              label="Stripe Connect account ID (optional)"
              help="Only needed later if you use Stripe Connect marketplace payouts. Normal checkout does not require this."
              value={paymentProviders.stripe_connect_account_id}
              onChange={(value) => onChange("stripe_connect_account_id", value)}
              placeholder="acct_..."
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-950">
                PayPal Checkout
              </h3>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Paste the PayPal REST app Client ID and Client Secret. Merchant
                ID is not required.
              </p>
            </div>

            <Toggle
              label="Enable PayPal"
              checked={paymentProviders.paypal_enabled}
              onChange={(value) => onChange("paypal_enabled", value)}
            />
          </div>

          <PaymentHelpCard
            title="PayPal setup guide"
            tone="amber"
            steps={[
              "Open PayPal Developer Dashboard and go to Apps & Credentials.",
              "Use Sandbox while testing, then switch to Live when ready for real payments.",
              "Create or open a REST API app for the business merchant account.",
              "Copy the Client ID and Secret into the fields below.",
              "For testing, create or use a Sandbox Personal account as the buyer. Do not pay with the same merchant account.",
            ]}
            links={[
              {
                label: "Open PayPal Apps",
                href: "https://developer.paypal.com/dashboard/applications",
              },
              {
                label: "Open Sandbox Accounts",
                href: "https://developer.paypal.com/dashboard/accounts",
              },
            ]}
          />

          <div className="mt-4 grid gap-4">
            <Select
              label="PayPal mode"
              help="Use Sandbox for testing. Switch to Live only when the organisation is ready to accept real payments."
              value={paymentProviders.paypal_mode}
              onChange={(value) =>
                onChange("paypal_mode", value === "live" ? "live" : "sandbox")
              }
              options={[
                { value: "sandbox", label: "Sandbox" },
                { value: "live", label: "Live" },
              ]}
            />

            <Input
              label="PayPal client ID"
              help="Found inside the PayPal REST API app under Apps & Credentials."
              value={paymentProviders.paypal_client_id}
              onChange={(value) => onChange("paypal_client_id", value)}
              placeholder="PayPal client ID"
            />

            <Input
              label="PayPal client secret"
              help="Click Show beside Secret inside the same PayPal REST API app. Leave blank after saving to keep the saved secret."
              value={paymentProviders.paypal_client_secret || ""}
              onChange={(value) => onChange("paypal_client_secret", value)}
              placeholder={
                paymentProviders.paypal_configured
                  ? "Saved — leave blank to keep current secret"
                  : "PayPal client secret"
              }
            />
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Textarea
          label="Payment success message"
          value={paymentProviders.payment_success_message}
          onChange={(value) => onChange("payment_success_message", value)}
        />

        <Textarea
          label="Payment pending message"
          value={paymentProviders.payment_pending_message}
          onChange={(value) => onChange("payment_pending_message", value)}
        />
      </div>
    </Panel>
  );
}
