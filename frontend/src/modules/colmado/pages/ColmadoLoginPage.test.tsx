import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ColmadoLoginPage from "./ColmadoLoginPage";


const authMocks = vi.hoisted(() => {
  class ColmadoAccessError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "ColmadoAccessError";
    }
  }

  return {
    ColmadoAccessError,
    loginToColmado: vi.fn(),
  };
});

vi.mock("../api/colmadoAuthClient", () => authMocks);


function Destination() {
  const { organisationSlug } = useParams();
  return <div>Panel de {organisationSlug}</div>;
}


function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/colmado/login"]}>
      <Routes>
        <Route path="/colmado/login" element={<ColmadoLoginPage />} />
        <Route
          path="/colmado/:organisationSlug"
          element={<Destination />}
        />
      </Routes>
    </MemoryRouter>,
  );
}


async function enterCredentials(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.type(
    screen.getByLabelText("Correo o usuario"),
    "dueno@example.com",
  );
  await user.type(
    screen.getByLabelText("Contraseña"),
    "ClaveSegura123",
  );
}


const loginResult = {
  user: {
    id: 10,
    email: "dueno@example.com",
    username: "dueno@example.com",
    first_name: "Juan",
    last_name: "Pérez",
    role: "owner",
    organisation: {
      id: 4,
      name: "Colmado La Esquina",
      slug: "colmado-la-esquina",
      business_type: "colmado",
      plan: "basic",
      is_active: true,
    },
  },
  organisation: {
    id: 4,
    name: "Colmado La Esquina",
    slug: "colmado-la-esquina",
    business_type: "colmado",
    plan: "basic",
    is_active: true,
  },
};


describe("ColmadoLoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows only the essential login controls", () => {
    renderPage();

    expect(screen.getByLabelText("Correo o usuario")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar a mi colmado" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Registrar mi colmado" }),
    ).toHaveAttribute("href", "/colmado/signup");
  });

  it("lets the owner show and hide the password", async () => {
    const user = userEvent.setup();
    renderPage();

    const password = screen.getByLabelText("Contraseña");
    expect(password).toHaveAttribute("type", "password");

    await user.click(
      screen.getByRole("button", { name: "Mostrar contraseña" }),
    );
    expect(password).toHaveAttribute("type", "text");

    await user.click(
      screen.getByRole("button", { name: "Ocultar contraseña" }),
    );
    expect(password).toHaveAttribute("type", "password");
  });

  it("logs in and opens the correct colmado", async () => {
    const user = userEvent.setup();
    authMocks.loginToColmado.mockResolvedValue(loginResult);
    renderPage();

    await enterCredentials(user);
    await user.click(
      screen.getByRole("button", { name: "Entrar a mi colmado" }),
    );

    expect(authMocks.loginToColmado).toHaveBeenCalledWith(
      "dueno@example.com",
      "ClaveSegura123",
    );
    expect(
      await screen.findByText("Panel de colmado-la-esquina"),
    ).toBeInTheDocument();
  });

  it("prevents repeated clicks while login is pending", async () => {
    const user = userEvent.setup();
    authMocks.loginToColmado.mockReturnValue(new Promise(() => {}));
    renderPage();

    await enterCredentials(user);
    await user.click(
      screen.getByRole("button", { name: "Entrar a mi colmado" }),
    );

    expect(
      screen.getByRole("button", { name: "Entrando…" }),
    ).toBeDisabled();
    expect(authMocks.loginToColmado).toHaveBeenCalledTimes(1);
  });

  it("shows a simple message for incorrect credentials", async () => {
    const user = userEvent.setup();
    authMocks.loginToColmado.mockRejectedValue({
      response: { status: 401 },
    });
    renderPage();

    await enterCredentials(user);
    await user.click(
      screen.getByRole("button", { name: "Entrar a mi colmado" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "El correo o la contraseña no son correctos.",
    );
    expect(
      screen.getByRole("button", { name: "Entrar a mi colmado" }),
    ).toBeEnabled();
  });

  it("explains when the account has no active colmado", async () => {
    const user = userEvent.setup();
    authMocks.loginToColmado.mockRejectedValue(
      new authMocks.ColmadoAccessError(
        "Esta cuenta no tiene un colmado activo.",
      ),
    );
    renderPage();

    await enterCredentials(user);
    await user.click(
      screen.getByRole("button", { name: "Entrar a mi colmado" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Esta cuenta no tiene un colmado activo.",
    );
  });
});
