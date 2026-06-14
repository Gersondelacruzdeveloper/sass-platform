import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Bell,
  Building2,
  CheckCircle2,
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

import {
  getDiscoBranding,
  updateDiscoBranding,
} from "../api/brandingApi";

import type { OrganisationBranding } from "../api/brandingApi";

type BrandingForm = OrganisationBranding;

export default function DiscoSettingsPage() {
  const { organisationSlug } = useParams();

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logo, setLogo] = useState<File | null>(null);
  const [favicon, setFavicon] = useState<File | null>(null);

  const [form, setForm] = useState<BrandingForm>({
    company_name: "",
    platform_name: "",
    login_title: "",
    login_subtitle: "",
    primary_color: "#020617",
    secondary_color: "#0f172a",
    accent_color: "#06b6d4",
    logo: null,
    favicon: null,
    logo_url: null,
    favicon_url: null,
  });

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
        const data = await getDiscoBranding(organisationSlug);

        setForm({
          company_name: data.company_name || "",
          platform_name: data.platform_name || "",
          login_title: data.login_title || "",
          login_subtitle: data.login_subtitle || "",
          primary_color: data.primary_color || "#020617",
          secondary_color: data.secondary_color || "#0f172a",
          accent_color: data.accent_color || "#06b6d4",
          logo: data.logo || null,
          favicon: data.favicon || null,
          logo_url: data.logo_url || data.logo || null,
          favicon_url: data.favicon_url || data.favicon || null,
        });
      } catch (error) {
        console.error("Could not load branding:", error);
      } finally {
        setLoading(false);
      }
    }

    loadBranding();
  }, [organisationSlug]);

  async function handleSave() {
    if (!organisationSlug) return;

    setSaving(true);

    try {
      const formData = new FormData();

      formData.append("company_name", form.company_name);
      formData.append("platform_name", form.platform_name);
      formData.append("login_title", form.login_title);
      formData.append("login_subtitle", form.login_subtitle);
      formData.append("primary_color", form.primary_color);
      formData.append("secondary_color", form.secondary_color);
      formData.append("accent_color", form.accent_color);

      if (logo) formData.append("logo", logo);
      if (favicon) formData.append("favicon", favicon);

      const data = await updateDiscoBranding(organisationSlug, formData);

      setForm((prev) => ({
        ...prev,
        company_name: data.company_name || prev.company_name,
        platform_name: data.platform_name || prev.platform_name,
        login_title: data.login_title || prev.login_title,
        login_subtitle: data.login_subtitle || prev.login_subtitle,
        primary_color: data.primary_color || prev.primary_color,
        secondary_color: data.secondary_color || prev.secondary_color,
        accent_color: data.accent_color || prev.accent_color,
        logo: data.logo || prev.logo,
        favicon: data.favicon || prev.favicon,
        logo_url: data.logo_url || data.logo || prev.logo_url,
        favicon_url: data.favicon_url || data.favicon || prev.favicon_url,
      }));

      setLogo(null);
      setFavicon(null);
    } catch (error) {
      console.error("Could not save branding:", error);
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
        subtitle="Manage branding, security, notifications, and operational configuration."
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
          title="Mobile"
          value="Ready"
          icon={Smartphone}
          helper="Mobile-first POS"
        />

        <DiscoStatCard
          title="Status"
          value="Live"
          icon={CheckCircle2}
          helper="System online"
        />
      </section>

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
              value={form.company_name}
              onChange={(value) => updateField("company_name", value)}
            />

            <Input
              label="Platform Name"
              value={form.platform_name}
              onChange={(value) => updateField("platform_name", value)}
            />

            <Input
              label="Login Title"
              value={form.login_title}
              onChange={(value) => updateField("login_title", value)}
            />

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Login Subtitle
              </span>

              <textarea
                value={form.login_subtitle}
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
              Colors & Assets
            </h2>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <ColorInput
              label="Primary Color"
              value={form.primary_color}
              onChange={(value) => updateField("primary_color", value)}
            />

            <ColorInput
              label="Secondary Color"
              value={form.secondary_color}
              onChange={(value) => updateField("secondary_color", value)}
            />

            <ColorInput
              label="Accent Color"
              value={form.accent_color}
              onChange={(value) => updateField("accent_color", value)}
            />

            <FileInput
              label="Logo"
              currentUrl={form.logo_url || form.logo}
              selectedFile={logo}
              onChange={setLogo}
            />

            <FileInput
              label="Favicon"
              currentUrl={form.favicon_url || form.favicon}
              selectedFile={favicon}
              onChange={setFavicon}
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
  currentUrl,
  selectedFile,
  onChange,
}: {
  label: string;
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

      <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={label}
            className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-contain"
          />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white text-slate-400">
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

function Toggle({ label }: { label: string }) {
  return (
    <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input type="checkbox" defaultChecked className="h-5 w-5" />
    </label>
  );
}