export interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  avatar?: string | null;
}

export interface LoginPayload {
  login: string;
  password: string;
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
