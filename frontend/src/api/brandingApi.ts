import api from "./axios";

export interface Branding {
  id: number;
  company_name: string;
  platform_name: string;
  logo: string | null;
  logo_url: string | null;
  favicon: string | null;
  favicon_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  login_title: string;
  login_subtitle: string;
}

export const defaultBranding: Branding = {
  id: 0,
  company_name: "Punta Cana Discovery",
  platform_name: "SaaS Platform",
  logo: null,
  logo_url: null,
  favicon: null,
  favicon_url: null,
  primary_color: "#111827",
  secondary_color: "#6B7280",
  accent_color: "#2563EB",
  login_title: "Welcome back",
  login_subtitle: "Sign in to continue to your workspace",
};

export async function getBranding(): Promise<Branding> {
  try {
    const response = await api.get<Branding>("/organisations/branding/");
    return response.data;
  } catch (error) {
    return defaultBranding;
  }
}