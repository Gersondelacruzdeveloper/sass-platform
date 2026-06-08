import api from "../../../api/axios";

export interface Expense {
  id: number;
  organisation: number;

  title: string;
  category: string;
  amount: string;

  note: string;
  created_by?: number | null;
  created_by_name?: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface CreateExpensePayload {
  title: string;
  category: string;
  amount: number | string;
  note?: string;
}

export interface UpdateExpensePayload
  extends Partial<CreateExpensePayload> {}

export async function getExpenses() {
  const res = await api.get<Expense[]>("/disco/expenses/");
  return res.data;
}

export async function getExpense(id: number) {
  const res = await api.get<Expense>(`/disco/expenses/${id}/`);
  return res.data;
}

export async function createExpense(
  payload: CreateExpensePayload
) {
  const res = await api.post<Expense>(
    "/disco/expenses/",
    payload
  );

  return res.data;
}

export async function updateExpense(
  id: number,
  payload: UpdateExpensePayload
) {
  const res = await api.patch<Expense>(
    `/disco/expenses/${id}/`,
    payload
  );

  return res.data;
}

export async function deleteExpense(id: number) {
  await api.delete(`/disco/expenses/${id}/`);
}

export async function getExpensesByCategory(category: string) {
  const res = await api.get<Expense[]>("/disco/expenses/", {
    params: { category },
  });

  return res.data;
}

export async function getRecentExpenses(limit = 10) {
  const res = await api.get<Expense[]>("/disco/expenses/", {
    params: {
      ordering: "-created_at",
      limit,
    },
  });

  return res.data;
}