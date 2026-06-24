// src/modules/disco/api/brandingApi.ts

import api from "../../../api/axios";

export interface OrganisationBranding {
  id?: number;
  organisation?: number;

  company_name: string;
  platform_name: string;

  app_short_name?: string;
  app_description?: string;

  login_title: string;
  login_subtitle: string;

  primary_color: string;
  secondary_color: string;
  accent_color: string;

  theme_color?: string;
  background_color?: string;

  logo?: string | null;
  logo_url?: string | null;

  // Generated automatically from logo
  favicon?: string | null;
  favicon_url?: string | null;

  app_icon_192?: string | null;
  app_icon_192_url?: string | null;

  app_icon_512?: string | null;
  app_icon_512_url?: string | null;

  maskable_icon?: string | null;
  maskable_icon_url?: string | null;

  created_at?: string;
  updated_at?: string;
}

export async function getDiscoBranding(organisationSlug: string) {
  const res = await api.get<OrganisationBranding>(
    `/organisations/branding/disco/${organisationSlug}/`
  );

  return res.data;
}

export async function getPublicDiscoBranding(organisationSlug: string) {
  const res = await api.get<OrganisationBranding>(
    `/organisations/public-branding/disco/${organisationSlug}/`
  );

  return res.data;
}

export async function updateDiscoBranding(
  organisationSlug: string,
  formData: FormData
) {
  const res = await api.patch<OrganisationBranding>(
    `/organisations/branding/disco/${organisationSlug}/`,
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );

  return res.data;
}