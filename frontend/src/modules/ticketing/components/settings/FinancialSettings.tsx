import { Banknote } from "lucide-react";

import {
  FormInput,
  SectionCard,
} from "./common/settings-common-components";

export type FinancialTicketingSettings = {
  currency_symbol: string;
  default_currency: string;
  supported_currencies: string[];
  tax_percentage: string;
  default_deposit_percentage: string;
};

type FinancialSettingsProps = {
  settings: FinancialTicketingSettings;
  supportedCurrenciesText: string;
  onSupportedCurrenciesTextChange: (value: string) => void;
  onChange: <K extends keyof FinancialTicketingSettings>(
    field: K,
    value: FinancialTicketingSettings[K]
  ) => void;
};

function formatExampleAmount(symbol: string, amount: number) {
  return `${symbol || "US$"} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function FinancialSettings({
  settings,
  supportedCurrenciesText,
  onSupportedCurrenciesTextChange,
  onChange,
}: FinancialSettingsProps) {
  const subtotalExample = 1000;
  const taxExample =
    subtotalExample * (Number(settings.tax_percentage || 0) / 100);
  const totalExample = subtotalExample + taxExample;

  return (
    <SectionCard
      title="Financial defaults"
      description="These defaults apply to bookings, receipts, seller balances and owner reports."
      icon={Banknote}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormInput
          label="Currency symbol"
          value={settings.currency_symbol}
          onChange={(value) => onChange("currency_symbol", value)}
          placeholder="US$"
        />

        <FormInput
          label="Default currency code"
          value={settings.default_currency}
          onChange={(value) => onChange("default_currency", value.toUpperCase())}
          placeholder="USD"
        />

        <FormInput
          label="Supported currency labels"
          value={supportedCurrenciesText}
          onChange={onSupportedCurrenciesTextChange}
          placeholder="USD, DOP, EUR"
        />

        <FormInput
          label="Tax percentage (%)"
          type="number"
          min="0"
          step="0.01"
          value={settings.tax_percentage}
          onChange={(value) => onChange("tax_percentage", value)}
          placeholder="18.00"
        />

        <FormInput
          label="Default deposit percentage (%)"
          type="number"
          min="0"
          step="0.01"
          value={settings.default_deposit_percentage}
          onChange={(value) => onChange("default_deposit_percentage", value)}
          placeholder="20.00"
        />
      </div>

      <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
        Example: subtotal{" "}
        <strong>{formatExampleAmount(settings.currency_symbol, 1000)}</strong>{" "}
        + tax{" "}
        <strong>{formatExampleAmount(settings.currency_symbol, taxExample)}</strong>{" "}
        = total{" "}
        <strong>{formatExampleAmount(settings.currency_symbol, totalExample)}</strong>
      </div>
    </SectionCard>
  );
}
