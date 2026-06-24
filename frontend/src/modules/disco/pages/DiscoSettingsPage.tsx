// src/modules/disco/pages/DiscoSettingsPage.tsx

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Bell,
  Building2,
  CheckCircle2,
  Image,
  Lock,
  Palette,
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

export default function DiscoSettingsPage() {
  const { organisationSlug } = useParams();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logo, setLogo] = useState<File | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [error, setError] = useState("");

  const [form, setForm] = useState<BrandingForm>(initialForm);

  function updateField<K extends keyof BrandingForm>(
    field: K,
    value: BrandingForm[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  useEffect(() => {
    async function loadBranding() {
      if (!organisationSlug) {
        setLoading(false);
        return;
      }

      try {
        setError("");
        const data = await getDiscoBranding(organisationSlug);

        setForm({
          company_name: data.company_name || "",
          platform_name: data.platform_name || "",
          app_short_name: (data as any).app_short_name || "",
          app_description: (data as any).app_description || "",
          login_title: data.login_title || "",
          login_subtitle: data.login_subtitle || "",

          primary_color: data.primary_color || "#020617",
          secondary_color: data.secondary_color || "#0f172a",
          accent_color: data.accent_color || "#06b6d4",
          theme_color: (data as any).theme_color || "#020617",
          background_color: (data as any).background_color || "#ffffff",

          logo: data.logo || null,
          logo_url: data.logo_url || data.logo || null,

          favicon: data.favicon || null,
          favicon_url: data.favicon_url || data.favicon || null,

          app_icon_192: (data as any).app_icon_192 || null,
          app_icon_192_url:
            (data as any).app_icon_192_url ||
            (data as any).app_icon_192 ||
            null,

          app_icon_512: (data as any).app_icon_512 || null,
          app_icon_512_url:
            (data as any).app_icon_512_url ||
            (data as any).app_icon_512 ||
            null,

          maskable_icon: (data as any).maskable_icon || null,
          maskable_icon_url:
            (data as any).maskable_icon_url ||
            (data as any).maskable_icon ||
            null,
        });
      } catch (error) {
        console.error("Could not load branding:", error);
        setError("Could not load branding settings.");
      } finally {
        setLoading(false);
      }
    }

    loadBranding();
  }, [organisationSlug]);

  async function handleSave() {
    if (!organisationSlug) return;

    setSaving(true);
    setSavedMessage("");
    setError("");

    try {
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

      // Only upload the logo.
      // Backend will generate favicon, 192 icon, 512 icon, and maskable icon.
      if (logo) {
        formData.append("logo", logo);
      }

      const data = await updateDiscoBranding(organisationSlug, formData);

      setForm((prev) => ({
        ...prev,

        company_name: data.company_name || prev.company_name,
        platform_name: data.platform_name || prev.platform_name,
        app_short_name: (data as any).app_short_name || prev.app_short_name,
        app_description: (data as any).app_description || prev.app_description,
        login_title: data.login_title || prev.login_title,
        login_subtitle: data.login_subtitle || prev.login_subtitle,

        primary_color: data.primary_color || prev.primary_color,
        secondary_color: data.secondary_color || prev.secondary_color,
        accent_color: data.accent_color || prev.accent_color,
        theme_color: (data as any).theme_color || prev.theme_color,
        background_color: (data as any).background_color || prev.background_color,

        logo: data.logo || prev.logo,
        logo_url: data.logo_url || data.logo || prev.logo_url,

        favicon: data.favicon || prev.favicon,
        favicon_url: data.favicon_url || data.favicon || prev.favicon_url,

        app_icon_192: (data as any).app_icon_192 || prev.app_icon_192,
        app_icon_192_url:
          (data as any).app_icon_192_url ||
          (data as any).app_icon_192 ||
          prev.app_icon_192_url,

        app_icon_512: (data as any).app_icon_512 || prev.app_icon_512,
        app_icon_512_url:
          (data as any).app_icon_512_url ||
          (data as any).app_icon_512 ||
          prev.app_icon_512_url,

        maskable_icon: (data as any).maskable_icon || prev.maskable_icon,
        maskable_icon_url:
          (data as any).maskable_icon_url ||
          (data as any).maskable_icon ||
          prev.maskable_icon_url,
      }));

      setLogo(null);
      setSavedMessage("Branding saved. Favicon and app icons were generated from the logo.");
    } catch (error) {
      console.error("Could not save branding:", error);
      setError("Could not save branding settings.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600">
        Loading settings...
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Settings"
        subtitle="Manage branding, installable app icons, colors, security, and operational configuration."
        icon={Settings}
        actionLabel={saving ? "Saving..." : "Save"}
        onAction={handleSave}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Organisation"
          value="Active"
          icon={Building2}
          helper="Tenant settings"
        />

        <DiscoStatCard
          title="Security"
          value="Enabled"
          icon={ShieldCheck}
          helper="Protected access"
        />

        <DiscoStatCard
          title="Mobile App"
          value="Ready"
          icon={Smartphone}
          helper="Logo generates app icons"
        />

        <DiscoStatCard
          title="Status"
          value="Live"
          icon={CheckCircle2}
          helper="System online"
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
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black text-slate-950">
              Organisation Branding
            </h2>
          </div>

          <div className="mt-5 space-y-4">
            <Input
              label="Company Name"
              value={form.company_name || ""}
              onChange={(value) => updateField("company_name", value)}
            />

            <Input
              label="Platform Name"
              value={form.platform_name || ""}
              onChange={(value) => updateField("platform_name", value)}
            />

            <Input
              label="App Short Name"
              value={form.app_short_name || ""}
              onChange={(value) => updateField("app_short_name", value)}
            />

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                App Description
              </span>

              <textarea
                value={form.app_description || ""}
                onChange={(event) =>
                  updateField("app_description", event.target.value)
                }
                placeholder="Short description used for the installable app."
                className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <Input
              label="Login Title"
              value={form.login_title || ""}
              onChange={(value) => updateField("login_title", value)}
            />

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Login Subtitle
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
              Colors & Logo
            </h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ColorInput
              label="Primary Color"
              value={form.primary_color || "#020617"}
              onChange={(value) => updateField("primary_color", value)}
            />

            <ColorInput
              label="Secondary Color"
              value={form.secondary_color || "#0f172a"}
              onChange={(value) => updateField("secondary_color", value)}
            />

            <ColorInput
              label="Accent Color"
              value={form.accent_color || "#06b6d4"}
              onChange={(value) => updateField("accent_color", value)}
            />

            <ColorInput
              label="App Theme Color"
              value={form.theme_color || "#020617"}
              onChange={(value) => updateField("theme_color", value)}
            />

            <ColorInput
              label="App Background Color"
              value={form.background_color || "#ffffff"}
              onChange={(value) => updateField("background_color", value)}
            />

            <FileInput
              label="Logo"
              description="Upload one logo. The system will generate favicon and mobile app icons automatically."
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
              Generated App Assets
            </h2>
          </div>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            These are generated automatically from the uploaded logo. You do not
            need to upload them manually.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <AssetPreview
              title="Logo"
              helper="Used in sidebar and login"
              url={form.logo_url || form.logo}
            />

            <AssetPreview
              title="Favicon"
              helper="Browser tab icon"
              url={form.favicon_url || form.favicon}
            />

            <AssetPreview
              title="App Icon 192"
              helper="PWA small icon"
              url={form.app_icon_192_url || form.app_icon_192}
            />

            <AssetPreview
              title="App Icon 512"
              helper="PWA install icon"
              url={form.app_icon_512_url || form.app_icon_512}
            />

            <AssetPreview
              title="Maskable Icon"
              helper="Android adaptive icon"
              url={form.maskable_icon_url || form.maskable_icon}
            />
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black text-slate-950">
              Notifications
            </h2>
          </div>

          <div className="mt-5 space-y-3">
            {[
              "Low stock alerts",
              "New reservation alerts",
              "Cash shift reminders",
              "Daily sales summary",
            ].map((item) => (
              <Toggle key={item} label={item} />
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black text-slate-950">Security</h2>
          </div>

          <div className="mt-5 space-y-3">
            {[
              "Require login for POS",
              "Restrict reports to managers",
              "Track staff activity logs",
              "Require cash shift before sales",
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
        {saving ? "Saving..." : "Save Settings"}
      </button>
    </div>
  );
}

function Input({
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

      <input
        value={value}
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
          <img
            src={url}
            alt={title}
            className="h-14 w-14 object-contain"
          />
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