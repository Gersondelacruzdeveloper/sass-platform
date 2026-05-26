import api from "./axios";
import type { Organisation, Membership } from "../types/organisation";

export const getOrganisations = async (): Promise<Organisation[]> => {
  const response = await api.get<Organisation[]>("/organisations/organisations/");
  return response.data;
};

export const getMemberships = async (): Promise<Membership[]> => {
  const response = await api.get<Membership[]>("/organisations/memberships/");
  return response.data;
};