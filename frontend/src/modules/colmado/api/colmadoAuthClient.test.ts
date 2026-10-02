import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ColmadoAccessError,
  getCurrentColmadoSession,
  loginToColmado,
  logoutFromColmado,
} from "./colmadoAuthClient";


const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../../api/axios", () => ({
  default: apiMocks,
}));


const activeColmado = {
  id: 4,
  name: "Colmado La Esquina",
  slug: "colmado-la-esquina",
  business_type: "colmado",
  plan: "basic",
  is_active: true,
};


function userData(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: 10,
    email: "dueno@example.com",
    username: "dueno@example.com",
    first_name: "Juan",
    last_name: "Pérez",
    phone: "809-555-0101",
    role: "owner",
    is_platform_owner: false,
    organisation: activeColmado,
    ...overrides,
  };
}


function loginResponse(
  overrides: Record<string, unknown> = {},
) {
  return {
    data: {
      detail: "Login successful",
      user: userData(overrides),
    },
  };
}


describe("colmadoAuthClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs in and returns the active colmado", async () => {
    apiMocks.post.mockResolvedValueOnce(loginResponse());

    const result = await loginToColmado(
      "  dueno@example.com  ",
      "ClaveSegura123",
    );

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/accounts/login/",
      {
        login: "dueno@example.com",
        password: "ClaveSegura123",
      },
    );
    expect(result.organisation).toEqual(activeColmado);
    expect(result.user.role).toBe("owner");
    expect(result.user.phone).toBe("809-555-0101");
  });

  it("identifies a platform owner after login", async () => {
    apiMocks.post.mockResolvedValueOnce(
      loginResponse({
        is_platform_owner: true,
      }),
    );

    const result = await loginToColmado(
      "admin@example.com",
      "ClaveSegura123",
    );

    expect(result.user.is_platform_owner).toBe(true);
  });

  it("restores the current colmado session", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: userData({
        is_platform_owner: true,
      }),
    });

    const result = await getCurrentColmadoSession();

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/accounts/me/",
    );
    expect(result.organisation.slug).toBe(
      "colmado-la-esquina",
    );
    expect(result.user.is_platform_owner).toBe(true);
  });

  it("logs out from the current session", async () => {
    apiMocks.post.mockResolvedValueOnce({
      data: {
        detail: "Logged out",
      },
    });

    await logoutFromColmado();

    expect(apiMocks.post).toHaveBeenCalledTimes(1);
    expect(apiMocks.post).toHaveBeenCalledWith(
      "/accounts/logout/",
    );
  });

  it("rejects an account without an organisation", async () => {
    apiMocks.post
      .mockResolvedValueOnce(
        loginResponse({
          organisation: null,
        }),
      )
      .mockResolvedValueOnce({
        data: {
          detail: "Logged out",
        },
      });

    await expect(
      loginToColmado(
        "user@example.com",
        "ClaveSegura123",
      ),
    ).rejects.toMatchObject({
      name: "ColmadoAccessError",
      message: "Esta cuenta no tiene un colmado activo.",
    });

    expect(apiMocks.post).toHaveBeenLastCalledWith(
      "/accounts/logout/",
    );
  });

  it("rejects an account belonging to another application", async () => {
    apiMocks.post
      .mockResolvedValueOnce(
        loginResponse({
          organisation: {
            ...activeColmado,
            business_type: "ticketing",
          },
        }),
      )
      .mockResolvedValueOnce({
        data: {
          detail: "Logged out",
        },
      });

    await expect(
      loginToColmado(
        "seller@example.com",
        "ClaveSegura123",
      ),
    ).rejects.toBeInstanceOf(ColmadoAccessError);

    expect(apiMocks.post).toHaveBeenLastCalledWith(
      "/accounts/logout/",
    );
  });

  it("rejects a colmado that has not completed payment", async () => {
    apiMocks.post
      .mockResolvedValueOnce(
        loginResponse({
          organisation: {
            ...activeColmado,
            is_active: false,
          },
        }),
      )
      .mockResolvedValueOnce({
        data: {
          detail: "Logged out",
        },
      });

    await expect(
      loginToColmado(
        "dueno@example.com",
        "ClaveSegura123",
      ),
    ).rejects.toThrow(
      "Esta cuenta no tiene un colmado activo.",
    );

    expect(apiMocks.post).toHaveBeenCalledTimes(2);
  });

  it("cleans up an invalid restored session", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: userData({
        organisation: null,
      }),
    });

    apiMocks.post.mockResolvedValueOnce({
      data: {
        detail: "Logged out",
      },
    });

    await expect(
      getCurrentColmadoSession(),
    ).rejects.toBeInstanceOf(ColmadoAccessError);

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/accounts/logout/",
    );
  });

  it("fails closed when session cleanup is unavailable", async () => {
    apiMocks.post
      .mockResolvedValueOnce(
        loginResponse({
          organisation: {
            ...activeColmado,
            business_type: "disco",
          },
        }),
      )
      .mockRejectedValueOnce(
        new Error("Network error"),
      );

    await expect(
      loginToColmado(
        "user@example.com",
        "ClaveSegura123",
      ),
    ).rejects.toThrow(
      "Esta cuenta no tiene un colmado activo.",
    );
  });
});