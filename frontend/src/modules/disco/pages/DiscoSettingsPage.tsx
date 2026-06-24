// src/modules/disco/pages/DiscoSettingsPage.tsx

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Banknote,
  Bell,
  Building2,
  CheckCircle2,
  Image,
  Lock,
  Palette,
  Percent,
  Save,
  Settings,
  ShieldCheck,
  Smartphone,
  Upload,
} from "lucide-react";

import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";

import { getDiscoBranding, updateDiscoBranding } from "../api/brandingApi";
import type { OrganisationBranding } from "../api/brandingApi";

import {
  getDiscoSettings,
  updateDiscoSettings,
  type DiscoSettings,
} from "../api/settingsApi";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";

type BrandingForm = OrganisationBranding & {
  app_short_name?: string;
  app_description?: string;
  theme_color?: string;
  background_color?: string;

  app_icon_192?: string | null;
  app_icon_192_url?: string | null;
  app_icon_512?: string | null;
  app_icon_512_url?: string | null;
  maskable_icon?: string | null;
  maskable_icon_url?: string | null;
};

type FinancialSettingsForm = {
  tax_percentage: string;
  currency_symbol: string;
};

const initialForm: BrandingForm = {
  company_name: "",
  platform_name: "",
  app_short_name: "",
  app_description: "",
  login_title: "",
  login_subtitle: "",

  primary_color: "#020617",
  secondary_color: "#0f172a",
  accent_color: "#06b6d4",
  theme_color: "#020617",
  background_color: "#ffffff",

  logo: null,
  logo_url: null,

  favicon: null,
  favicon_url: null,

  app_icon_192: null,
  app_icon_192_url: null,
  app_icon_512: null,
  app_icon_512_url: null,
  maskable_icon: null,
  maskable_icon_url: null,
};

const initialFinancialSettings: FinancialSettingsForm = {
  tax_percentage: "0.00",
  currency_symbol: "RD$",
};

export default function DiscoSettingsPage() {
  const { t } = useDiscoTranslation();
  const { organisationSlug } = useParams();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logo, setLogo] = useState<File | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState<BrandingForm>(initialForm);
  const [financialSettings, setFinancialSettings] =
    useState<FinancialSettingsForm>(initialFinancialSettings);

  function updateField<K extends keyof BrandingForm>(
    field: K,
    value: BrandingForm[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateFinancialField<K extends keyof FinancialSettingsForm>(
    field: K,
    value: FinancialSettingsForm[K]
  ) {
    setFinancialSettings((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    async function loadSettingsPage() {
      try {
        setError("");

        const settingsPromise = getDiscoSettings();

        const brandingPromise = organisationSlug
          ? getDiscoBranding(organisationSlug)
          : Promise.resolve(null);

        const [brandingData, settingsData] = await Promise.all([
          brandingPromise,
          settingsPromise,
        ]);

        if (brandingData) {
          setForm({
            company_name: brandingData.company_name || "",
            platform_name: brandingData.platform_name || "",
            app_short_name: (brandingData as any).app_short_name || "",
            app_description: (brandingData as any).app_description || "",
            login_title: brandingData.login_title || "",
            login_subtitle: brandingData.login_subtitle || "",

            primary_color: brandingData.primary_color || "#020617",
            secondary_color: brandingData.secondary_color || "#0f172a",
            accent_color: brandingData.accent_color || "#06b6d4",
            theme_color: (brandingData as any).theme_color || "#020617",
            background_color: (brandingData as any).background_color || "#ffffff",

            logo: brandingData.logo || null,
            logo_url: brandingData.logo_url || brandingData.logo || null,

            favicon: brandingData.favicon || null,
            favicon_url:
              brandingData.favicon_url || brandingData.favicon || null,

            app_icon_192: (brandingData as any).app_icon_192 || null,
            app_icon_192_url:
              (brandingData as any).app_icon_192_url ||
              (brandingData as any).app_icon_192 ||
              null,

            app_icon_512: (brandingData as any).app_icon_512 || null,
            app_icon_512_url:
              (brandingData as any).app_icon_512_url ||
              (brandingData as any).app_icon_512 ||
              null,

            maskable_icon: (brandingData as any).maskable_icon || null,
            maskable_icon_url:
              (brandingData as any).maskable_icon_url ||
              (brandingData as any).maskable_icon ||
              null,
          });
        }

        if (settingsData) {
          setFinancialSettings({
            tax_percentage: settingsData.tax_percentage || "0.00",
            currency_symbol: settingsData.currency_symbol || "RD$",
          });
        }
      } catch (error) {
        console.error("Could not load settings:", error);
        setError("No se pudo cargar la configuración.");
      } finally {
        setLoading(false);
      }
    }

    loadSettingsPage();
  }, [organisationSlug]);

  async function handleSave() {
    setSaving(true);
    setSavedMessage("");
    setError("");

    try {
      const saveTasks: Promise<OrganisationBranding | DiscoSettings>[] = [];

      if (organisationSlug) {
        const formData = new FormData();

        formData.append("company_name", form.company_name || "");
        formData.append("platform_name", form.platform_name || "");
        formData.append("app_short_name", form.app_short_name || "");
        formData.append("app_description", form.app_description || "");
        formData.append("login_title", form.login_title || "");
        formData.append("login_subtitle", form.login_subtitle || "");

        formData.append("primary_color", form.primary_color || "#020617");
        formData.append("secondary_color", form.secondary_color || "#0f172a");
        formData.append("accent_color", form.accent_color || "#06b6d4");
        formData.append("theme_color", form.theme_color || "#020617");
        formData.append("background_color", form.background_color || "#ffffff");

        if (logo) {
          formData.append("logo", logo);
        }

        saveTasks.push(updateDiscoBranding(organisationSlug, formData));
      }

      saveTasks.push(
        updateDiscoSettings({
          tax_percentage: financialSettings.tax_percentage || "0.00",
          currency_symbol: financialSettings.currency_symbol || "RD$",
        })
      );

      const responses = await Promise.all(saveTasks);
      const brandingData = responses.find(
        (response) => "company_name" in response
      ) as OrganisationBranding | undefined;

      const settingsData = responses.find(
        (response) => "tax_percentage" in response
      ) as DiscoSettings | undefined;

      if (brandingData) {
        setForm((prev) => ({
          ...prev,

          company_name: brandingData.company_name || prev.company_name,
          platform_name: brandingData.platform_name || prev.platform_name,
          app_short_name:
            (brandingData as any).app_short_name || prev.app_short_name,
          app_description:
            (brandingData as any).app_description || prev.app_description,
          login_title: brandingData.login_title || prev.login_title,
          login_subtitle: brandingData.login_subtitle || prev.login_subtitle,

          primary_color: brandingData.primary_color || prev.primary_color,
          secondary_color: brandingData.secondary_color || prev.secondary_color,
          accent_color: brandingData.accent_color || prev.accent_color,
          theme_color: (brandingData as any).theme_color || prev.theme_color,
          background_color:
            (brandingData as any).background_color || prev.background_color,

          logo: brandingData.logo || prev.logo,
          logo_url: brandingData.logo_url || brandingData.logo || prev.logo_url,

          favicon: brandingData.favicon || prev.favicon,
          favicon_url:
            brandingData.favicon_url || brandingData.favicon || prev.favicon_url,

          app_icon_192:
            (brandingData as any).app_icon_192 || prev.app_icon_192,
          app_icon_192_url:
            (brandingData as any).app_icon_192_url ||
            (brandingData as any).app_icon_192 ||
            prev.app_icon_192_url,

          app_icon_512:
            (brandingData as any).app_icon_512 || prev.app_icon_512,
          app_icon_512_url:
            (brandingData as any).app_icon_512_url ||
            (brandingData as any).app_icon_512 ||
            prev.app_icon_512_url,

          maskable_icon:
            (brandingData as any).maskable_icon || prev.maskable_icon,
          maskable_icon_url:
            (brandingData as any).maskable_icon_url ||
            (brandingData as any).maskable_icon ||
            prev.maskable_icon_url,
        }));
      }

      if (settingsData) {
        setFinancialSettings({
          tax_percentage: settingsData.tax_percentage || "0.00",
          currency_symbol: settingsData.currency_symbol || "RD$",
        });
      }

      setLogo(null);
      setSavedMessage("Configuración guardada correctamente.");
    } catch (error) {
      console.error("Could not save settings:", error);
      setError("No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600">
        {t("settings.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
        icon={Settings}
        actionLabel={saving ? t("settings.saving") : t("settings.save")}
        onAction={handleSave}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("settings.organisation")}
          value={t("settings.active")}
          icon={Building2}
          helper={t("settings.tenantSettings")}
        />

        <DiscoStatCard
          title="Impuesto"
          value={`${Number(financialSettings.tax_percentage || 0)}%`}
          icon={Percent}
          helper="Aplicado automáticamente en ventas"
        />

        <DiscoStatCard
          title="Moneda"
          value={financialSettings.currency_symbol || "RD$"}
          icon={Banknote}
          helper="Solo símbolo visual, sin conversión"
        />

        <DiscoStatCard
          title={t("settings.status")}
          value={t("settings.live")}
          icon={CheckCircle2}
          helper={t("settings.systemOnline")}
        />
      </section>

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      {savedMessage && (
        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          {savedMessage}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-center gap-3">
            <Banknote className="h-5 w-5 text-slate-500" />

            <h2 className="text-lg font-black text-slate-950">
              Configuración financiera
            </h2>
          </div>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            Define el impuesto que se aplicará automáticamente a las ventas y el
            símbolo de moneda que aparecerá en tickets, POS y reportes.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Input
              label="Impuesto configurable (%)"
              value={financialSettings.tax_percentage}
              onChange={(value) =>
                updateFinancialField("tax_percentage", value)
              }
              type="number"
              min="0"
              step="0.01"
              placeholder="18.00"
            />

            <Input
              label="Símbolo de moneda"
              value={financialSettings.currency_symbol}
              onChange={(value) =>
                updateFinancialField("currency_symbol", value)
              }
              placeholder="RD$"
            />
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
            Ejemplo: si el subtotal es {financialSettings.currency_symbol || "RD$"}{" "}
            1,000.00 y el impuesto es{" "}
            {Number(financialSettings.tax_percentage || 0)}%, el sistema
            calculará el impuesto automáticamente al cerrar la venta.
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-slate-500" />

            <h2 className="text-lg font-black text-slate-950">
              {t("settings.organisationBranding")}
            </h2>
          </div>

          <div className="mt-5 space-y-4">
            <Input
              label={t("settings.companyName")}
              value={form.company_name || ""}
              onChange={(value) => updateField("company_name", value)}
            />

            <Input
              label={t("settings.platformName")}
              value={form.platform_name || ""}
              onChange={(value) => updateField("platform_name", value)}
            />

            <Input
              label={t("settings.appShortName")}
              value={form.app_short_name || ""}
              onChange={(value) => updateField("app_short_name", value)}
            />

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {t("settings.appDescription")}
              </span>

              <textarea
                value={form.app_description || ""}
                onChange={(event) =>
                  updateField("app_description", event.target.value)
                }
                placeholder={t("settings.appDescriptionPlaceholder")}
                className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <Input
              label={t("settings.loginTitle")}
              value={form.login_title || ""}
              onChange={(value) => updateField("login_title", value)}
            />

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {t("settings.loginSubtitle")}
              </span>

              <textarea
                value={form.login_subtitle || ""}
                onChange={(event) =>
                  updateField("login_subtitle", event.target.value)
                }
                className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Palette className="h-5 w-5 text-slate-500" />

            <h2 className="text-lg font-black text-slate-950">
              {t("settings.colorsLogo")}
            </h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ColorInput
              label={t("settings.primaryColor")}
              value={form.primary_color || "#020617"}
              onChange={(value) => updateField("primary_color", value)}
            />

            <ColorInput
              label={t("settings.secondaryColor")}
              value={form.secondary_color || "#0f172a"}
              onChange={(value) => updateField("secondary_color", value)}
            />

            <ColorInput
              label={t("settings.accentColor")}
              value={form.accent_color || "#06b6d4"}
              onChange={(value) => updateField("accent_color", value)}
            />

            <ColorInput
              label={t("settings.appThemeColor")}
              value={form.theme_color || "#020617"}
              onChange={(value) => updateField("theme_color", value)}
            />

            <ColorInput
              label={t("settings.appBackgroundColor")}
              value={form.background_color || "#ffffff"}
              onChange={(value) => updateField("background_color", value)}
            />

            <FileInput
              label={t("settings.logo")}
              description={t("settings.logoDescription")}
              currentUrl={form.logo_url || form.logo}
              selectedFile={logo}
              onChange={setLogo}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-center gap-3">
            <Image className="h-5 w-5 text-slate-500" />

            <h2 className="text-lg font-black text-slate-950">
              {t("settings.generatedAppAssets")}
            </h2>
          </div>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            {t("settings.generatedAppAssetsDescription")}
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AssetPreview
              title={t("settings.logo")}
              helper={t("settings.sidebarLoginLogo")}
              url={form.logo_url || form.logo}
            />

            <AssetPreview
              title={t("settings.favicon")}
              helper={t("settings.browserTabIcon")}
              url={form.favicon_url || form.favicon}
            />

            <AssetPreview
              title={t("settings.appIcon192")}
              helper={t("settings.pwaSmallIcon")}
              url={form.app_icon_192_url || form.app_icon_192}
            />

            <AssetPreview
              title={t("settings.appIcon512")}
              helper={t("settings.pwaInstallIcon")}
              url={form.app_icon_512_url || form.app_icon_512}
            />

            <AssetPreview
              title={t("settings.maskableIcon")}
              helper={t("settings.androidAdaptiveIcon")}
              url={form.maskable_icon_url || form.maskable_icon}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-slate-500" />

            <h2 className="text-lg font-black text-slate-950">
              {t("settings.notifications")}
            </h2>
          </div>

          <div className="mt-5 space-y-3">
            {[
              t("settings.lowStockAlerts"),
              t("settings.newReservationAlerts"),
              t("settings.cashShiftReminders"),
              t("settings.dailySalesSummary"),
            ].map((item) => (
              <Toggle key={item} label={item} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-slate-500" />

            <h2 className="text-lg font-black text-slate-950">
              {t("settings.security")}
            </h2>
          </div>

          <div className="mt-5 space-y-3">
            {[
              t("settings.requireLoginForPOS"),
              t("settings.restrictReportsToManagers"),
              t("settings.trackStaffActivityLogs"),
              t("settings.requireCashShiftBeforeSales"),
            ].map((item) => (
              <Toggle key={item} label={item} />
            ))}
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        <Save className="h-4 w-4" />
        {saving ? t("settings.saving") : t("settings.saveSettings")}
      </button>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  min,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <input
        type={type}
        min={min}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
      />
    </label>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3">
        <input
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />

        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full flex-1 bg-transparent text-sm font-semibold outline-none"
        />
      </div>
    </label>
  );
}

function FileInput({
  label,
  description,
  currentUrl,
  selectedFile,
  onChange,
}: {
  label: string;
  description?: string;
  currentUrl?: string | null;
  selectedFile?: File | null;
  onChange: (file: File | null) => void;
}) {
  const previewUrl = selectedFile
    ? URL.createObjectURL(selectedFile)
    : currentUrl || null;

  return (
    <label className="block sm:col-span-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      {description && (
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {description}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={label}
            className="h-16 w-16 rounded-xl border border-slate-200 bg-white object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white text-slate-400">
            <Upload className="h-5 w-5" />
          </div>
        )}

        <input
          type="file"
          accept="image/*"
          onChange={(event) => onChange(event.target.files?.[0] || null)}
          className="w-full text-sm font-semibold text-slate-600"
        />
      </div>
    </label>
  );
}

function AssetPreview({
  title,
  helper,
  url,
}: {
  title: string;
  helper: string;
  url?: string | null;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-20 items-center justify-center rounded-2xl bg-white">
        {url ? (
          <img src={url} alt={title} className="h-14 w-14 object-contain" />
        ) : (
          <Image className="h-6 w-6 text-slate-300" />
        )}
      </div>

      <p className="mt-3 text-sm font-black text-slate-950">{title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function Toggle({ label }: { label: string }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input type="checkbox" defaultChecked className="h-5 w-5" />
    </label>
  );
}