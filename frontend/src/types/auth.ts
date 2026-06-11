export interface User {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  role?: string | null;
  avatar?: string | null;
  is_platform_owner?: boolean;

  organisation?: {
    id: number;
    name: string;
    slug: string;
    business_type: string;
    plan: string;
  } | null;

  facilitator?: {
    id: number;
    employee_id: number;
    employee_name: string;
    active: boolean;
    can_create_employees: boolean;
    can_create_trainings: boolean;
    can_create_evaluations: boolean;
    can_view_reports: boolean;
  } | null;
}


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

