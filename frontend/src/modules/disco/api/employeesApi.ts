// src/modules/disco/api/employeesApi.ts

import api from "../../../api/axios";

export type EmployeeRole =
  | "owner"
  | "manager"
  | "cashier"
  | "bartender"
  | "waiter"
  | "security"
  | "host"
  | "promoter"
  | "inventory_manager";

export type EmployeePermissionKey =
  | "can_access_dashboard"
  | "can_access_pos"
  | "can_manage_products"
  | "can_manage_inventory"
  | "can_manage_employees"
  | "can_manage_tables"
  | "can_manage_reservations"
  | "can_manage_expenses"
  | "can_view_reports"
  | "can_manage_settings"
  | "can_view_activity_logs"
  | "can_open_cash_shift"
  | "can_close_cash_shift"
  | "can_apply_discounts"
  | "can_cancel_sales";

export type EmployeePermissions = Partial<
  Record<EmployeePermissionKey, boolean>
>;

export interface DiscoEmployee {
  id: number;
  organisation: number;
  user?: number | null;

  username?: string;
  email?: string;

  full_name: string;
  role: EmployeeRole;
  phone?: string | null;

  daily_pay?: string | number;
  start_date?: string | null;
  end_date?: string | null;

  is_active: boolean;

  permissions?: EmployeePermissions;

  can_access_dashboard?: boolean;
  can_access_pos?: boolean;
  can_manage_products?: boolean;
  can_manage_inventory?: boolean;
  can_manage_employees?: boolean;
  can_manage_tables?: boolean;
  can_manage_reservations?: boolean;
  can_manage_expenses?: boolean;
  can_view_reports?: boolean;
  can_manage_settings?: boolean;
  can_view_activity_logs?: boolean;
  can_open_cash_shift?: boolean;
  can_close_cash_shift?: boolean;
  can_apply_discounts?: boolean;
  can_cancel_sales?: boolean;

  profile_image_url?: string | null;
  user_avatar_url?: string | null;
  employee_photo_url?: string | null;

  photo?: string | null;
  photo_url?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;

  created_at?: string;
  updated_at?: string;
}

export type CreateEmployeePayload = FormData | Partial<DiscoEmployee>;
export type UpdateEmployeePayload = FormData | Partial<DiscoEmployee>;

function isFormData(payload: unknown): payload is FormData {
  return typeof FormData !== "undefined" && payload instanceof FormData;
}

function requestConfig(payload: unknown) {
  if (!isFormData(payload)) {
    return undefined;
  }

  // Do not manually set multipart boundary.
  // The browser will set the correct Content-Type with boundary.
  return {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  };
}

export async function getEmployees() {
  const response = await api.get<DiscoEmployee[]>("/disco/employees/");
  return response.data;
}

export async function getEmployee(id: number) {
  const response = await api.get<DiscoEmployee>(`/disco/employees/${id}/`);
  return response.data;
}

export async function getCurrentDiscoEmployee() {
  const response = await api.get<DiscoEmployee>("/disco/employees/me/");
  return response.data;
}

export async function createEmployee(payload: CreateEmployeePayload) {
  const response = await api.post<DiscoEmployee>(
    "/disco/employees/",
    payload,
    requestConfig(payload)
  );

  return response.data;
}

export async function updateEmployee(
  id: number,
  payload: UpdateEmployeePayload
) {
  const response = await api.patch<DiscoEmployee>(
    `/disco/employees/${id}/`,
    payload,
    requestConfig(payload)
  );

  return response.data;
}

export async function deleteEmployee(id: number) {
  await api.delete(`/disco/employees/${id}/`);
}

export async function activateEmployee(id: number) {
  return updateEmployee(id, { is_active: true });
}

export async function deactivateEmployee(id: number) {
  return updateEmployee(id, { is_active: false });
}
