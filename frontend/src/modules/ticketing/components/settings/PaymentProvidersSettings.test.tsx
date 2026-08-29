import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import PaymentProvidersSettings from "./PaymentProvidersSettings";


describe("PaymentProvidersSettings", () => {
  it("updates the tenant default customer payment option", async () => {
    const onChange = vi.fn();
    const Select = ({ label, value, onChange, options }: any) => (
      <label>
        {label}
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option: any) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
    const Empty = () => null;
    const Panel = ({ children }: any) => <div>{children}</div>;

    render(
      <PaymentProvidersSettings
        paymentProviders={{
          default_provider: "stripe",
          default_customer_payment_choice: "deposit",
          stripe_enabled: true,
          stripe_publishable_key: "pk_test",
          stripe_connect_account_id: "",
          stripe_connect_status: "connected",
          paypal_enabled: true,
          paypal_mode: "live",
          paypal_client_id: "client",
          paypal_merchant_id: "merchant",
          payment_success_message: "Paid",
          payment_pending_message: "Pending",
          is_active: true,
        }}
        publicSite={{ custom_domain: "tenant.test", subdomain: "tenant" }}
        onChange={onChange}
        Panel={Panel}
        Input={Empty as any}
        Textarea={Empty as any}
        Select={Select}
        Toggle={Empty as any}
        PaymentHelpCard={Empty as any}
        CopyValue={Empty as any}
        getDetectedPublicDomain={() => "tenant.test"}
        getStripeWebhookEndpoint={() => "https://api.test/webhook"}
        getStripeKeyModeLabel={() => "Test"}
      />
    );

    await userEvent.selectOptions(
      screen.getByLabelText("Default customer payment option"),
      "cash"
    );
    expect(onChange).toHaveBeenCalledWith(
      "default_customer_payment_choice",
      "cash"
    );
  });
});
