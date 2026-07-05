import { Smartphone } from "lucide-react";

import {
  ColorInput,
  FormInput,
  FormTextarea,
  SectionCard,
} from "./common/settings-common-components";

export type OrganisationBranding = {
  id?: number;
  organisation?: number;

  company_name: string;
  platform_name: string;

  logo?: string | null;
  logo_url?: string | null;

  favicon?: string | null;
  favicon_url?: string | null;
  app_icon_192?: string | null;
  app_icon_192_url?: string | null;
  app_icon_512?: string | null;
  app_icon_512_url?: string | null;
  maskable_icon?: string | null;
  maskable_icon_url?: string | null;

  app_short_name: string;
  app_description: string;

  primary_color: string;
  secondary_color: string;
  accent_color: string;
  theme_color: string;
  background_color: string;

  login_title: string;
  login_subtitle: string;
};

type BrandingSettingsProps = {
  branding: OrganisationBranding;
  logoFile: File | null;
  onChange: <K extends keyof OrganisationBranding>(
    field: K,
    value: OrganisationBranding[K]
  ) => void;
  onLogoFileChange: (file: File | null) => void;
};

export default function BrandingSettings({
  branding,
  logoFile,
  onChange,
  onLogoFileChange,
}: BrandingSettingsProps) {
  return (
    <SectionCard
      title="App, login and dashboard branding"
      description="This controls the logo, generated favicon, installable app icons, login text and dashboard branding. Upload the logo only once; the backend generates the favicon and PWA icons."
      icon={Smartphone}
      className="xl:col-span-2"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <FormInput
          label="Company name"
          value={branding.company_name}
          onChange={(value) => onChange("company_name", value)}
          placeholder="Punta Cana Discovery"
        />

        <FormInput
          label="Platform name"
          value={branding.platform_name}
          onChange={(value) => onChange("platform_name", value)}
          placeholder="PCD Experiences"
        />

        <FormInput
          label="App short name"
          value={branding.app_short_name}
          onChange={(value) => onChange("app_short_name", value)}
          placeholder="PCD"
        />

        <FormTextarea
          label="App description"
          value={branding.app_description}
          onChange={(value) => onChange("app_description", value)}
          placeholder="Book and manage tours, tickets and transfers."
        />

        <FormInput
          label="Login title"
          value={branding.login_title}
          onChange={(value) => onChange("login_title", value)}
          placeholder="Welcome back"
        />

        <FormTextarea
          label="Login subtitle"
          value={branding.login_subtitle}
          onChange={(value) => onChange("login_subtitle", value)}
          placeholder="Access your bookings, sellers, products and reports."
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <ColorInput
          label="Primary color"
          value={branding.primary_color}
          onChange={(value) => onChange("primary_color", value)}
        />

        <ColorInput
          label="Secondary color"
          value={branding.secondary_color}
          onChange={(value) => onChange("secondary_color", value)}
        />

        <ColorInput
          label="Accent color"
          value={branding.accent_color}
          onChange={(value) => onChange("accent_color", value)}
        />

        <ColorInput
          label="Theme color"
          value={branding.theme_color}
          onChange={(value) => onChange("theme_color", value)}
        />

        <ColorInput
          label="Background color"
          value={branding.background_color}
          onChange={(value) => onChange("background_color", value)}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <LogoUploadCard
          label="Main logo"
          description="Master image used to generate favicon, app icons, login logo and dashboard branding."
          currentUrl={branding.logo_url || branding.logo}
          selectedFile={logoFile}
          onChange={onLogoFileChange}
        />

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
          Do not upload favicon manually. This app uses the same working flow as
          Disco: upload the logo, then the backend creates favicon, 192x192
          icon, 512x512 icon and maskable icon automatically.
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AssetPreview
          title="Logo"
          helper="Uploaded master image"
          url={branding.logo_url || branding.logo}
        />

        <AssetPreview
          title="Generated favicon"
          helper="Browser tab icon"
          url={branding.favicon_url || branding.favicon}
        />

        <AssetPreview
          title="App icon 192"
          helper="Small install icon"
          url={branding.app_icon_192_url || branding.app_icon_192}
        />

        <AssetPreview
          title="App icon 512"
          helper="Large install icon"
          url={branding.app_icon_512_url || branding.app_icon_512}
        />

        <AssetPreview
          title="Maskable icon"
          helper="Android adaptive icon"
          url={branding.maskable_icon_url || branding.maskable_icon}
        />
      </div>
    </SectionCard>
  );
}

function LogoUploadCard({
  label,
  description,
  currentUrl,
  selectedFile,
  onChange,
}: {
  label: string;
  description: string;
  currentUrl?: string | null;
  selectedFile: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div>
        <p className="text-sm font-black text-slate-900">{label}</p>
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          {description}
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {selectedFile ? (
            <img
              src={URL.createObjectURL(selectedFile)}
              alt="Selected logo preview"
              className="h-full w-full object-contain"
            />
          ) : currentUrl ? (
            <img
              src={currentUrl}
              alt="Current logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="px-3 text-center text-xs font-bold text-slate-400">
              No logo
            </span>
          )}
        </div>

        <div className="flex-1">
          <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800">
            Upload logo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                onChange(file);
              }}
            />
          </label>

          {selectedFile && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-3 inline-flex rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              Clear
            </button>
          )}

          {selectedFile && (
            <p className="mt-2 text-xs font-semibold text-slate-500">
              Selected: {selectedFile.name}
            </p>
          )}
        </div>
      </div>
    </div>
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
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-20 items-center justify-center rounded-2xl border border-slate-200 bg-white">
        {url ? (
          <img src={url} alt={title} className="max-h-16 max-w-full object-contain" />
        ) : (
          <span className="text-xs font-bold text-slate-400">Pending</span>
        )}
      </div>

      <p className="mt-3 text-sm font-black text-slate-900">{title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}
