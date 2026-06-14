import api from "../../../api/axios";

export interface OrganisationBranding {
  company_name: string;
  platform_name: string;
  login_title: string;
  login_subtitle: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  logo?: string | null;
  favicon?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
}

export async function getDiscoBranding(organisationSlug: string) {
  const res = await api.get<OrganisationBranding>(
    `/organisations/branding/disco/${organisationSlug}/`
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