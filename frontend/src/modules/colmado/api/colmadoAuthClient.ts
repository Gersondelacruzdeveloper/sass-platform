import api from "../../../api/axios";


interface LoginOrganisation {
  id: number;
  name: string;
  slug: string;
  business_type: string;
  plan: string;
  is_active: boolean;
}

interface LoginUser {
  id: number;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  role: string | null;
  organisation: LoginOrganisation | null;
}

interface LoginResponse {
  detail: string;
  user: LoginUser;
}

export interface ColmadoLoginResult {
  user: LoginUser;
  organisation: LoginOrganisation;
}


export class ColmadoAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ColmadoAccessError";
  }
}


export async function loginToColmado(
  login: string,
  password: string,
): Promise<ColmadoLoginResult> {
  const response = await api.post<LoginResponse>("/accounts/login/", {
    login: login.trim(),
    password,
  });

  const { user } = response.data;
  const organisation = user.organisation;

  if (
    !organisation
    || organisation.business_type !== "colmado"
    || !organisation.is_active
  ) {
    try {
      await api.post("/accounts/logout/");
    } catch {
      // The login must still fail closed even if session cleanup is unavailable.
    }

    throw new ColmadoAccessError(
      "Esta cuenta no tiene un colmado activo.",
    );
  }

  return {
    user,
    organisation,
  };
}
