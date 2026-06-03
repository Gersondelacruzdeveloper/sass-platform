import api from "./axios";
import type {
  LoginPayload,
  RegisterPayload,
  TokenResponse,
  User,
} from "../types/auth";

export const login = async (
  payload: LoginPayload
): Promise<TokenResponse> => {

  // Create CSRF cookie first
  await api.get("/accounts/csrf/");

  const response = await api.post<TokenResponse>(
    "/accounts/login/",
    payload
  );

  return response.data;
};

export const register = async (
  payload: RegisterPayload
): Promise<User> => {

  await api.get("/accounts/csrf/");

  const response = await api.post<User>(
    "/accounts/register/",
    payload
  );

  return response.data;
};

export const getMe = async (): Promise<User> => {
  const response = await api.get<User>("/accounts/me/");
  return response.data;
};