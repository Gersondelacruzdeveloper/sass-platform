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

export interface DiscoEmployee {
  id: number;
  organisation: number;
  user: number | null;

  username?: string;
  email?: string;

  avatar?: string | null;
  avatar_url?: string | null;

  full_name: string;
  role: EmployeeRole;
  phone: string;
  is_active: boolean;

  created_at?: string;
  updated_at?: string;
}

export interface CreateEmployeePayload {
  user?: number | null;
  full_name: string;
  role: EmployeeRole;
  phone?: string;
  is_active?: boolean;

  create_login?: boolean;
  login_username?: string;
  login_email?: string;
  login_password?: string;
}

export type UpdateEmployeePayload = Partial<CreateEmployeePayload>;

type EmployeePayload = CreateEmployeePayload | UpdateEmployeePayload | FormData;

export async function getEmployees() {
  const res = await api.get<DiscoEmployee[]>("/disco/employees/");
  return res.data;
}

export async function getEmployee(id: number) {
  const res = await api.get<DiscoEmployee>(`/disco/employees/${id}/`);
  return res.data;
}

export async function createEmployee(payload: EmployeePayload) {
  const res = await api.post<DiscoEmployee>("/disco/employees/", payload);
  return res.data;
}

export async function updateEmployee(id: number, payload: EmployeePayload) {
  const res = await api.patch<DiscoEmployee>(
    `/disco/employees/${id}/`,
    payload
  );

  return res.data;
}

export async function deleteEmployee(id: number) {
  await api.delete(`/disco/employees/${id}/`);
}

export async function activateEmployee(id: number) {
  const res = await api.patch<DiscoEmployee>(`/disco/employees/${id}/`, {
    is_active: true,
  });

  return res.data;
}

export async function deactivateEmployee(id: number) {
  const res = await api.patch<DiscoEmployee>(`/disco/employees/${id}/`, {
    is_active: false,
  });

  return res.data;
}