import {
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import AppRoutes from "./AppRoutes";


vi.mock(
  "../modules/colmado/pages/PublicStorefrontPage",
  () => ({
    default: () => <h1>Tienda pública del colmado</h1>,
  }),
);


vi.mock(
  "../modules/colmado/pages/PublicOrderTrackingPage",
  () => ({
    default: () => <h1>Seguimiento público del pedido</h1>,
  }),
);


vi.mock("../pages/LoginPage", () => ({
  default: () => <h1>Inicio de sesión existente</h1>,
}));


vi.mock("../pages/RegisterPage", () => ({
  default: () => <p>Registro</p>,
}));


vi.mock("../pages/DashboardPage", () => ({
  default: () => <p>Dashboard</p>,
}));


vi.mock("../pages/OrganisationsPage", () => ({
  default: () => <p>Organizaciones</p>,
}));


vi.mock("../pages/AuditLogsPage", () => ({
  default: () => <p>Auditoría</p>,
}));


vi.mock(
  "../modules/colmado/routes/colmadoRoutes",
  () => ({ colmadoRoutes: [] }),
);


vi.mock(
  "../modules/disco/routes/discoRoutes",
  () => ({ discoRoutes: [] }),
);


vi.mock(
  "../modules/partner-network/routes/partnerNetworkRoutes",
  () => ({ partnerNetworkRoutes: [] }),
);


vi.mock(
  "../modules/ticketing/routes/ticketingRoutes",
  () => ({ ticketingRoutes: [] }),
);


vi.mock(
  "../modules/training/routes/trainingRoutes",
  () => ({ trainingRoutes: [] }),
);


vi.mock(
  "../modules/organisational-development/routes/careerRoutes",
  () => ({ careerRoutes: [] }),
);


function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}


describe("AppRoutes public colmado ordering", () => {
  it("opens a storefront directly without requiring login", () => {
    renderAt("/pedir/colmado-rodrigo");

    expect(
      screen.getByRole("heading", {
        name: "Tienda pública del colmado",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Inicio de sesión existente",
      }),
    ).not.toBeInTheDocument();
  });


  it("uses the order tracking route instead of the storefront route", () => {
    renderAt(
      "/pedir/colmado-rodrigo/pedido/" +
        "65fd724d-c072-4aa4-ab66-47a21af8368a",
    );

    expect(
      screen.getByRole("heading", {
        name: "Seguimiento público del pedido",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Tienda pública del colmado",
      }),
    ).not.toBeInTheDocument();
  });


  it("keeps the existing login route working", () => {
    renderAt("/login");

    expect(
      screen.getByRole("heading", {
        name: "Inicio de sesión existente",
      }),
    ).toBeInTheDocument();
  });
});
