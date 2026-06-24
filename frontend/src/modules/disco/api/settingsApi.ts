// src/modules/disco/api/settingsApi.ts

import api from "../../../api/axios";

export type DiscoSettings = {
  id: number;
  organisation: number;
  tax_percentage: string;
  currency_symbol: string;
  created_at?: string;
  updated_at?: string;
};

export async function getDiscoSettings() {
  const response = await api.get<DiscoSettings>("/disco/settings/current/");
  return response.data;
}

export async function updateDiscoSettings(payload: Partial<DiscoSettings>) {
  const response = await api.patch<DiscoSettings>(
    "/disco/settings/current/",
    payload
  );

  return response.data;
}