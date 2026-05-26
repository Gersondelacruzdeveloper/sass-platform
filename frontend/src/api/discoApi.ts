import api from "./axios";
import type {
  Category,
  Product,
  StockMovement,
  Sale,
  Expense,
} from "../types/disco";

export const getDiscoCategories = async (): Promise<Category[]> => {
  const response = await api.get<Category[]>("/disco/categories/");
  return response.data;
};

export const getDiscoProducts = async (): Promise<Product[]> => {
  const response = await api.get<Product[]>("/disco/products/");
  return response.data;
};

export const createDiscoProduct = async (
  payload: Partial<Product>
): Promise<Product> => {
  const response = await api.post<Product>("/disco/products/", payload);
  return response.data;
};

export const getStockMovements = async (): Promise<StockMovement[]> => {
  const response = await api.get<StockMovement[]>("/disco/stock-movements/");
  return response.data;
};

export const createStockMovement = async (
  payload: Partial<StockMovement>
): Promise<StockMovement> => {
  const response = await api.post<StockMovement>(
    "/disco/stock-movements/",
    payload
  );
  return response.data;
};

export const getSales = async (): Promise<Sale[]> => {
  const response = await api.get<Sale[]>("/disco/sales/");
  return response.data;
};

export const getExpenses = async (): Promise<Expense[]> => {
  const response = await api.get<Expense[]>("/disco/expenses/");
  return response.data;
};

export const createExpense = async (
  payload: Partial<Expense>
): Promise<Expense> => {
  const response = await api.post<Expense>("/disco/expenses/", payload);
  return response.data;
};