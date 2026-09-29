import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ColmadoAccessError,
  loginToColmado,
} from "./colmadoAuthClient";


const apiMocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("../../../api/axios", () => ({
  default: apiMocks,
}));


function loginResponse(
  organisation: {
    id: number;
    name: string;
    slug: string;
    business_type: string;
    plan: string;
    is_active: boolean;
  } | null,
) {
  return {
    data: {
      detail: "Login successful",
      user: {
        id: 10,
        email: "dueno@example.com",
        username: "dueno@example.com",
        first_name: "Juan",
        last_name: "Pérez",
        role: "owner",
        organisation,
      },
    },
  };
}


const activeColmado = {
  id: 4,
  name: "Colmado La Esquina",
  slug: "colmado-la-esquina",
  business_type: "colmado",
  plan: "basic",
  is_active: true,
};


describe("colmadoAuthClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in and returns the active colmado", async () => {
    apiMocks.post.mockResolvedValueOnce(loginResponse(activeColmado));

    const result = await loginToColmado(
      "  dueno@example.com  ",
      "ClaveSegura123",
    );

    expect(apiMocks.post).toHaveBeenCalledWith("/accounts/login/", {
      login: "dueno@example.com",
      password: "ClaveSegura123",
    });
    expect(result.organisation).toEqual(activeColmado);
    expect(result.user.role).toBe("owner");
  });

  it("rejects an account without an organisation", async () => {
    apiMocks.post
      .mockResolvedValueOnce(loginResponse(null))
      .mockResolvedValueOnce({ data: { detail: "Logged out" } });

    await expect(
      loginToColmado("user@example.com", "ClaveSegura123"),
    ).rejects.toMatchObject({
      name: "ColmadoAccessError",
      message: "Esta cuenta no tiene un colmado activo.",
    });
    expect(apiMocks.post).toHaveBeenLastCalledWith("/accounts/logout/");
  });

  it("rejects an account belonging to another application", async () => {
    apiMocks.post
      .mockResolvedValueOnce(
        loginResponse({
          ...activeColmado,
          business_type: "ticketing",
        }),
      )
      .mockResolvedValueOnce({ data: { detail: "Logged out" } });

    await expect(
      loginToColmado("seller@example.com", "ClaveSegura123"),
    ).rejects.toBeInstanceOf(ColmadoAccessError);
    expect(apiMocks.post).toHaveBeenLastCalledWith("/accounts/logout/");
  });

  it("rejects a colmado that has not completed payment", async () => {
    apiMocks.post
      .mockResolvedValueOnce(
        loginResponse({
          ...activeColmado,
          is_active: false,
        }),
      )
      .mockResolvedValueOnce({ data: { detail: "Logged out" } });

    await expect(
      loginToColmado("dueno@example.com", "ClaveSegura123"),
    ).rejects.toThrow("Esta cuenta no tiene un colmado activo.");
    expect(apiMocks.post).toHaveBeenCalledTimes(2);
  });

  it("fails closed when session cleanup is unavailable", async () => {
    apiMocks.post
      .mockResolvedValueOnce(
        loginResponse({
          ...activeColmado,
          business_type: "disco",
        }),
      )
      .mockRejectedValueOnce(new Error("Network error"));

    await expect(
      loginToColmado("user@example.com", "ClaveSegura123"),
    ).rejects.toThrow("Esta cuenta no tiene un colmado activo.");
  });
});
