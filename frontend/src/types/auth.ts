import type { User } from "./user";

export type { User };

export interface LoginPayload {
  login: string;
  password: string;
  organisation_slug?: string;
}

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

export interface TokenResponse {
  access: string;
  refresh: string;
}