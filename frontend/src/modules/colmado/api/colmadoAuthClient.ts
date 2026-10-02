import api from "../../../api/axios";


export interface ColmadoOrganisation {
  id: number;
  name: string;
  slug: string;
  business_type: string;
  plan: string;
  is_active: boolean;
}


export interface ColmadoUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: string | null;
  is_platform_owner: boolean;
  organisation: ColmadoOrganisation | null;
}


interface LoginResponse {
  detail: string;
  user: ColmadoUser;
}


export interface ColmadoLoginResult {
  user: ColmadoUser;
  organisation: ColmadoOrganisation;
}


export class ColmadoAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ColmadoAccessError";
  }
}


function requireActiveColmado(
  user: ColmadoUser,
): ColmadoLoginResult {
  const organisation = user.organisation;

  if (
    !organisation
    || organisation.business_type !== "colmado"
    || !organisation.is_active
  ) {
    throw new ColmadoAccessError(
      "Esta cuenta no tiene un colmado activo.",
    );
  }

  return {
    user,
    organisation,
  };
}


async function clearInvalidSession(): Promise<void> {
  try {
    await api.post("/accounts/logout/");
  } catch {
    // El acceso permanece bloqueado aunque no se pueda limpiar la sesión.
  }
}


export async function loginToColmado(
  login: string,
  password: string,
): Promise<ColmadoLoginResult> {
  const response = await api.post<LoginResponse>(
    "/accounts/login/",
    {
      login: login.trim(),
      password,
    },
  );

  try {
    return requireActiveColmado(response.data.user);
  } catch (error) {
    await clearInvalidSession();
    throw error;
  }
}


export async function getCurrentColmadoSession(): Promise<
  ColmadoLoginResult
> {
  const response = await api.get<ColmadoUser>(
    "/accounts/me/",
  );

  try {
    return requireActiveColmado(response.data);
  } catch (error) {
    await clearInvalidSession();
    throw error;
  }
}


export async function logoutFromColmado(): Promise<void> {
  await api.post("/accounts/logout/");
}