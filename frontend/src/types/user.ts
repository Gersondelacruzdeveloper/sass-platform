export type BusinessType =
  | "disco"
  | "hotel"
  | "restaurant"
  | "store"
  | "excursions"
  | "training";

export type UserRole =
  | "owner"
  | "admin"
  | "manager"
  | "cashier"
  | "bartender"
  | "waiter"
  | "security"
  | "host"
  | "promoter"
  | "inventory_manager"
  | "facilitator"
  | string;

export type User = {
  id: number;
  email: string;
  username: string;

  first_name?: string;
  last_name?: string;
  phone?: string | null;
  avatar?: string | null;

  is_platform_owner?: boolean;

  role: UserRole | null;
  permissions?: Record<string, boolean>;

  organisation: {
    id: number;
    name: string;
    slug?: string;
    business_type: BusinessType | string;
    plan: string;
  } | null;

  disco_employee?: {
    full_name?: string;
    role?: UserRole;
    organisation_name?: string;
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
};