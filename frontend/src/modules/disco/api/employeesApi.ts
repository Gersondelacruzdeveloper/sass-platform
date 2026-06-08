import api from "../../../api/axios";

export interface DiscoEmployee {
  id: number;
  organisation: number;

  user: number | null;

  full_name: string;
  role:
    | "owner"
    | "manager"
    | "cashier"
    | "bartender"
    | "waiter"
    | "security"
    | "host"
    | "promoter"
    | "inventory_manager";

  phone: string;
  is_active: boolean;

  created_at?: string;
  updated_at?: string;
}

export interface CreateEmployeePayload {
  user?: number | null;
  full_name: string;
  role: DiscoEmployee["role"];
  phone?: string;
  is_active?: boolean;
}

export interface UpdateEmployeePayload
  extends Partial<CreateEmployeePayload> {}

export async function getEmployees() {
  const res = await api.get<DiscoEmployee[]>("/disco/employees/");
  return res.data;
}

export async function getEmployee(id: number) {
  const res = await api.get<DiscoEmployee>(
    `/disco/employees/${id}/`
  );

  return res.data;
}

export async function createEmployee(
  payload: CreateEmployeePayload
) {
  const res = await api.post<DiscoEmployee>(
    "/disco/employees/",
    payload
  );

  return res.data;
}

export async function updateEmployee(
  id: number,
  payload: UpdateEmployeePayload
) {
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
  const res = await api.patch<DiscoEmployee>(
    `/disco/employees/${id}/`,
    {
      is_active: true,
    }
  );

  return res.data;
}

export async function deactivateEmployee(id: number) {
  const res = await api.patch<DiscoEmployee>(
    `/disco/employees/${id}/`,
    {
      is_active: false,
    }
  );

  return res.data;
}